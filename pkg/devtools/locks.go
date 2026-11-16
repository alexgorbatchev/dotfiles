package devtools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type lockContextKey struct{}
type lockIdentity string

type processLock struct {
	token chan struct{}
	refs  int
}

var processLocks = struct {
	sync.Mutex
	entries map[lockIdentity]*processLock
}{entries: make(map[lockIdentity]*processLock)}

func acquireProcessLock(ctx context.Context, key lockIdentity) (func(), error) {
	processLocks.Lock()
	entry := processLocks.entries[key]
	if entry == nil {
		entry = &processLock{token: make(chan struct{}, 1)}
		processLocks.entries[key] = entry
	}
	entry.refs++
	processLocks.Unlock()
	unref := func() {
		processLocks.Lock()
		defer processLocks.Unlock()
		entry.refs--
		if entry.refs == 0 {
			delete(processLocks.entries, key)
		}
	}
	select {
	case entry.token <- struct{}{}:
		return func() { <-entry.token; unref() }, nil
	case <-ctx.Done():
		unref()
		return nil, ctx.Err()
	}
}

// WithLock serializes a tool's deployment, shim generation, and release lifecycle.
// The callback context makes nested operations reentrant. OS-backed handles acquire
// an advisory file lock released by the kernel on process exit; in-memory filesystems
// use the same process lock without touching the host filesystem.
func (s *Store) WithLock(ctx context.Context, tool string, fn func(context.Context) error) (err error) {
	if err := ctx.Err(); err != nil {
		return err
	}
	dir, err := s.directory(tool)
	if err != nil {
		return err
	}
	key := lockIdentity(dir)
	held, _ := ctx.Value(lockContextKey{}).(map[lockIdentity]bool)
	if held[key] {
		return fn(ctx)
	}
	release, err := acquireProcessLock(ctx, key)
	if err != nil {
		return fmt.Errorf("waiting for development lock for %s: %w", tool, err)
	}
	defer release()
	lockDir := filepath.Join(filepath.Dir(dir), ".locks")
	if err := s.ensureDirectory(lockDir); err != nil {
		return err
	}
	// Never unlink a lock file: a waiter may still hold its inode when another
	// process opens the name, and they would then lock different files.
	file, err := s.fs.OpenFile(filepath.Join(lockDir, tool+".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return fmt.Errorf("opening development lock for %s: %w", tool, err)
	}
	defer func() { err = errors.Join(err, file.Close()) }()
	if handle, ok := file.(interface{ Fd() uintptr }); ok {
		if err := waitFileLock(ctx, handle.Fd()); err != nil {
			return fmt.Errorf("locking development tool %s: %w", tool, err)
		}
		defer func() { err = errors.Join(err, unlockFile(handle.Fd())) }()
	}
	next := make(map[lockIdentity]bool, len(held)+1)
	for key, value := range held {
		next[key] = value
	}
	next[key] = true
	return fn(context.WithValue(ctx, lockContextKey{}, next))
}

func waitFileLock(ctx context.Context, fd uintptr) error {
	for {
		locked, err := tryFileLock(fd)
		if err != nil || locked {
			return err
		}
		timer := time.NewTimer(20 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}
