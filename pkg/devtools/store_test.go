package devtools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func fixture(t *testing.T) (*Store, *fs.MemFS, UseOptions) {
	t.Helper()
	mem := fs.NewMemFS()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	binary := filepath.Join(source, "tool")
	if err := mem.MkdirAll(source, 0755); err != nil {
		t.Fatal(err)
	}
	if err := mem.WriteFile(binary, []byte("development one"), 0755); err != nil {
		t.Fatal(err)
	}
	return New(mem, filepath.Join(root, "generated", "dev-tools")), mem, UseOptions{Binaries: map[string]string{"tool": binary}, Version: "dev.1", SourceRepo: source}
}

func requireUse(t *testing.T, store *Store, tool string, opts UseOptions) *Record {
	t.Helper()
	rec, err := store.Use(context.Background(), tool, opts)
	if err != nil {
		t.Fatal(err)
	}
	return rec
}

func TestSelectionLifecycle(t *testing.T) {
	store, mem, opts := fixture(t)
	ctx := context.Background()
	if rec, err := store.Lookup("tool"); err != nil || rec != nil {
		t.Fatalf("initial selection: %+v, %v", rec, err)
	}
	if records, err := store.List(); err != nil || len(records) != 0 {
		t.Fatalf("initial list: %+v, %v", records, err)
	}
	first := requireUse(t, store, "tool", opts)
	if first.SourceRepo != opts.SourceRepo || first.Version != "dev.1" {
		t.Fatalf("build identity lost: %+v", first)
	}
	if err := mem.WriteFile(opts.Binaries["tool"], []byte("development two"), 0755); err != nil {
		t.Fatal(err)
	}
	if data, _ := mem.ReadFile(first.Binaries["tool"]); string(data) != "development one" {
		t.Fatalf("source mutation changed deployed build: %s", data)
	}
	second := requireUse(t, store, "tool", opts)
	if second.Generation == first.Generation {
		t.Fatal("replacement reused a live generation")
	}
	if err := store.Validate(first); err != nil {
		t.Fatalf("replacement destroyed executable needed by existing shim: %v", err)
	}
	if got, err := store.Lookup("tool"); err != nil || !reflect.DeepEqual(got, second) {
		t.Fatalf("active selection: %+v, %v", got, err)
	}
	if err := store.Restore(ctx, "tool", first); err != nil {
		t.Fatal(err)
	}
	if err := store.Prune(ctx, "tool"); err != nil {
		t.Fatal(err)
	}
	if err := store.Validate(first); err != nil {
		t.Fatalf("pruning removed the restored build: %v", err)
	}
	if err := store.Validate(second); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("pruning retained inactive build: %v", err)
	}
	if err := store.Off(ctx, "tool"); err != nil {
		t.Fatal(err)
	}
	if rec, err := store.Lookup("tool"); err != nil || rec != nil {
		t.Fatalf("off retained selection: %+v, %v", rec, err)
	}
	if err := store.Validate(first); err != nil {
		t.Fatalf("off removed executable before generation: %v", err)
	}
	if err := store.Prune(ctx, "tool"); err != nil {
		t.Fatal(err)
	}
	if err := store.Validate(first); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("off followed by prune retained payload: %v", err)
	}
	if err := store.Off(ctx, "tool"); err != nil {
		t.Fatalf("off is not idempotent: %v", err)
	}
	if err := store.Prune(ctx, "absent"); err != nil {
		t.Fatalf("pruning absent tool: %v", err)
	}
}

func TestMissingPayloadKeepsOwnership(t *testing.T) {
	store, mem, opts := fixture(t)
	rec := requireUse(t, store, "tool", opts)
	if err := mem.Remove(rec.Binaries["tool"]); err != nil {
		t.Fatal(err)
	}
	if active, err := store.Lookup("tool"); err != nil || !reflect.DeepEqual(active, rec) {
		t.Fatalf("missing executable lost protection: %+v, %v", active, err)
	}
	if err := store.Validate(rec); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing executable was accepted: %v", err)
	}
	if err := store.Validate(nil); err == nil {
		t.Fatal("nil record accepted")
	}
}

func TestMultipleBinariesAndSortedInventory(t *testing.T) {
	store, mem, opts := fixture(t)
	opts.Binaries["second"] = opts.Binaries["tool"]
	for _, tool := range []string{"zebra", "alpha"} {
		rec := requireUse(t, store, tool, opts)
		if len(rec.Binaries) != 2 || rec.Binaries["second"] == rec.Binaries["tool"] {
			t.Fatalf("distinct commands not deployed: %+v", rec)
		}
	}
	if err := mem.MkdirAll(filepath.Join(store.root, "unused"), 0700); err != nil {
		t.Fatal(err)
	}
	records, err := store.List()
	if err != nil || len(records) != 2 || records[0].Tool != "alpha" || records[1].Tool != "zebra" {
		t.Fatalf("inventory: %+v, %v", records, err)
	}
}

func TestInvalidInputCannotReplaceBuild(t *testing.T) {
	for _, name := range []string{"", "../other", "/root", ".", "..", ".locks", "foo/bar", `foo\bar`, "foo:", "tool "} {
		t.Run(fmt.Sprintf("name=%q", name), func(t *testing.T) {
			store, _, opts := fixture(t)
			if _, err := store.Use(context.Background(), name, opts); err == nil {
				t.Fatal("unsafe name accepted")
			}
			if _, err := store.Lookup(name); err == nil {
				t.Fatal("unsafe lookup accepted")
			}
		})
	}
	for _, test := range []struct {
		name string
		opts func(UseOptions) UseOptions
	}{
		{"empty binaries", func(UseOptions) UseOptions { return UseOptions{} }},
		{"unsafe binary name", func(o UseOptions) UseOptions {
			return UseOptions{Binaries: map[string]string{"../outside": o.Binaries["tool"]}}
		}},
		{"missing binary", func(o UseOptions) UseOptions {
			return UseOptions{Binaries: map[string]string{"tool": filepath.Join(o.SourceRepo, "missing")}}
		}},
		{"directory binary", func(o UseOptions) UseOptions { return UseOptions{Binaries: map[string]string{"tool": o.SourceRepo}} }},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, _, opts := fixture(t)
			before := requireUse(t, store, "tool", opts)
			if _, err := store.Use(context.Background(), "tool", test.opts(opts)); err == nil {
				t.Fatal("invalid deployment succeeded")
			}
			after, err := store.Lookup("tool")
			if err != nil || !reflect.DeepEqual(before, after) {
				t.Fatalf("failed deployment changed selection: %+v %v", after, err)
			}
		})
	}
}

func TestCorruptManifestFailsClosed(t *testing.T) {
	for _, contents := range []string{`{`, `{}`, `{"tool":"other","generation":"build-a","binaries":{"tool":"/outside"}}`} {
		store, mem, opts := fixture(t)
		requireUse(t, store, "tool", opts)
		if err := mem.WriteFile(filepath.Join(store.root, "tool", "active.json"), []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := store.Lookup("tool"); err == nil {
			t.Fatalf("accepted corrupt manifest: %s", contents)
		}
		if _, err := store.List(); err == nil {
			t.Fatal("inventory hid corrupt manifest")
		}
		if _, err := store.Use(context.Background(), "tool", opts); err == nil {
			t.Fatal("registration overwrote corrupt manifest")
		}
		if err := store.Prune(context.Background(), "tool"); err == nil {
			t.Fatal("pruning ignored corrupt manifest")
		}
	}
}

func TestRecordTraversalAndSymlinksRejected(t *testing.T) {
	store, mem, opts := fixture(t)
	rec := requireUse(t, store, "tool", opts)
	for _, change := range []func(*Record){
		func(r *Record) { r.Generation = "../outside" },
		func(r *Record) { r.Generation = "not-a-build" },
		func(r *Record) { r.Binaries = nil },
		func(r *Record) { r.Binaries = map[string]string{"tool": "/outside"} },
	} {
		bad := *rec
		change(&bad)
		if err := store.Restore(context.Background(), "tool", &bad); err == nil {
			t.Fatalf("unsafe record restored: %+v", bad)
		}
		if err := store.Validate(&bad); err == nil {
			t.Fatalf("unsafe record validated: %+v", bad)
		}
	}
	manifest := filepath.Join(store.root, "tool", "active.json")
	if err := mem.Remove(manifest); err != nil {
		t.Fatal(err)
	}
	if err := mem.Symlink(opts.Binaries["tool"], manifest); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Lookup("tool"); err == nil {
		t.Fatal("symlink manifest accepted")
	}
	if err := mem.Remove(rec.Binaries["tool"]); err != nil {
		t.Fatal(err)
	}
	if err := mem.Symlink(opts.Binaries["tool"], rec.Binaries["tool"]); err != nil {
		t.Fatal(err)
	}
	if err := store.Validate(rec); err == nil {
		t.Fatal("symlink payload accepted")
	}
	if err := mem.Symlink(opts.SourceRepo, filepath.Join(store.root, "elsewhere")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Lookup("elsewhere"); err == nil {
		t.Fatal("symlink tool directory accepted")
	}
	if err := store.Off(context.Background(), "elsewhere"); err == nil {
		t.Fatal("off followed a symlink tool directory")
	}
}

type faultFS struct {
	fs.FS
	op   string
	part string
}

var errInjected = errors.New("injected filesystem failure")

func (f faultFS) fail(op, path string) error {
	if f.op == op && strings.Contains(path, f.part) {
		return errInjected
	}
	return nil
}

func (f faultFS) Abs(path string) (string, error) {
	if err := f.fail("abs", path); err != nil {
		return "", err
	}
	return f.FS.Abs(path)
}
func (f faultFS) Lstat(path string) (os.FileInfo, error) {
	if err := f.fail("lstat", path); err != nil {
		return nil, err
	}
	return f.FS.Lstat(path)
}
func (f faultFS) ReadFile(path string) ([]byte, error) {
	if err := f.fail("read", path); err != nil {
		return nil, err
	}
	return f.FS.ReadFile(path)
}
func (f faultFS) ReadDir(path string) ([]string, error) {
	if err := f.fail("readdir", path); err != nil {
		return nil, err
	}
	return f.FS.ReadDir(path)
}
func (f faultFS) MkdirAll(path string, mode os.FileMode) error {
	if err := f.fail("mkdir", path); err != nil {
		return err
	}
	return f.FS.MkdirAll(path, mode)
}
func (f faultFS) OpenFile(path string, flag int, mode os.FileMode) (io.WriteCloser, error) {
	if err := f.fail("open", path); err != nil {
		return nil, err
	}
	return f.FS.OpenFile(path, flag, mode)
}
func (f faultFS) WriteFile(path string, data []byte, mode os.FileMode) error {
	if err := f.fail("write", path); err != nil {
		return err
	}
	return f.FS.WriteFile(path, data, mode)
}
func (f faultFS) CopyFile(src, dest string) error {
	if err := f.fail("copy", dest); err != nil {
		return err
	}
	return f.FS.CopyFile(src, dest)
}
func (f faultFS) Rename(src, dest string) error {
	if err := f.fail("rename", dest); err != nil {
		return err
	}
	return f.FS.Rename(src, dest)
}
func (f faultFS) Remove(path string) error {
	if err := f.fail("remove", path); err != nil {
		return err
	}
	return f.FS.Remove(path)
}
func (f faultFS) RemoveAll(path string) error {
	if err := f.fail("removeall", path); err != nil {
		return err
	}
	return f.FS.RemoveAll(path)
}

func TestDeploymentFailuresPreserveSelectionAndCleanStaging(t *testing.T) {
	for _, fault := range []struct{ op, part string }{
		{"abs", "dev-tools"}, {"abs", "source"}, {"lstat", "active.json"}, {"read", "active.json"},
		{"mkdir", ".locks"}, {"mkdir", "build-"}, {"lstat", ".locks"}, {"open", ".lock"},
		{"copy", "build-"}, {"write", ".active-"}, {"rename", "active.json"},
	} {
		t.Run(fault.op+fault.part, func(t *testing.T) {
			store, mem, opts := fixture(t)
			before := requireUse(t, store, "tool", opts)
			broken := New(faultFS{FS: mem, op: fault.op, part: fault.part}, store.root)
			if _, err := broken.Use(context.Background(), "tool", opts); !errors.Is(err, errInjected) {
				t.Fatalf("failure lost: %v", err)
			}
			after, err := store.Lookup("tool")
			if err != nil || !reflect.DeepEqual(before, after) {
				t.Fatalf("failed deployment changed selection: %+v, %v", after, err)
			}
			entries, err := mem.ReadDir(filepath.Join(store.root, "tool"))
			if err != nil || len(entries) != 2 {
				t.Fatalf("failed deployment leaked files: %v, %v", entries, err)
			}
		})
	}
}

func TestReadAndRemovalFailures(t *testing.T) {
	store, mem, opts := fixture(t)
	first := requireUse(t, store, "tool", opts)
	requireUse(t, store, "tool", opts)
	ctx := context.Background()
	for _, test := range []struct {
		op, part string
		run      func(*Store) error
	}{
		{"readdir", "dev-tools", func(s *Store) error { _, err := s.List(); return err }},
		{"readdir", string(filepath.Separator) + "tool", func(s *Store) error { return s.Prune(ctx, "tool") }},
		{"removeall", first.Generation, func(s *Store) error { return s.Prune(ctx, "tool") }},
		{"remove", "active.json", func(s *Store) error { return s.Off(ctx, "tool") }},
		{"lstat", string(filepath.Separator) + "tool", func(s *Store) error { return s.Restore(ctx, "tool", first) }},
	} {
		t.Run(test.op, func(t *testing.T) {
			broken := New(faultFS{FS: mem, op: test.op, part: test.part}, store.root)
			if err := test.run(broken); !errors.Is(err, errInjected) {
				t.Fatalf("error swallowed: %v", err)
			}
		})
	}
	if _, err := New(mem, "").List(); err == nil {
		t.Fatal("empty root accepted")
	}
	if _, err := New(mem, "").Lookup("tool"); err == nil {
		t.Fatal("empty root accepted")
	}
	if err := store.Restore(ctx, "..", first); err == nil {
		t.Fatal("invalid restore tool accepted")
	}
}

func TestReentrantAndConcurrentLocks(t *testing.T) {
	store, mem, opts := fixture(t)
	ctx := context.Background()
	if err := store.WithLock(ctx, "tool", func(ctx context.Context) error {
		_, err := New(mem, store.root).Use(ctx, "tool", opts)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{})
	release := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- store.WithLock(ctx, "tool", func(context.Context) error { close(entered); <-release; return nil })
	}()
	<-entered
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if err := store.WithLock(cancelled, "tool", func(context.Context) error { t.Error("cancelled callback ran"); return nil }); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled lock: %v", err)
	}
	deadline, cancelDeadline := context.WithTimeout(ctx, 10*time.Millisecond)
	defer cancelDeadline()
	if err := store.WithLock(deadline, "tool", func(context.Context) error { t.Error("parallel callback ran"); return nil }); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("waiting lock: %v", err)
	}
	if err := store.WithLock(ctx, "independent", func(context.Context) error { return nil }); err != nil {
		t.Fatalf("independent tool blocked: %v", err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 6 {
		wg.Go(func() {
			if _, err := store.Use(ctx, "tool", opts); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	rec, err := store.Lookup("tool")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Validate(rec); err != nil {
		t.Fatal(err)
	}
	processLocks.Lock()
	remaining := len(processLocks.entries)
	processLocks.Unlock()
	if remaining != 0 {
		t.Fatalf("leaked %d process locks", remaining)
	}
}

func TestOSLockExcludesAnotherHandleAndHonorsCancellation(t *testing.T) {
	dir := t.TempDir()
	store := New(fs.NewResolvedFS(fs.NewOSFS(), dir), filepath.Join(dir, "dev-tools"))
	if err := store.WithLock(context.Background(), "tool", func(context.Context) error {
		file, err := os.OpenFile(filepath.Join(dir, "dev-tools", ".locks", "tool.lock"), os.O_RDWR, 0600)
		if err != nil {
			return err
		}
		defer file.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()
		if err := waitFileLock(ctx, file.Fd()); !errors.Is(err, context.DeadlineExceeded) {
			return fmt.Errorf("second handle bypassed native lock: %w", err)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(filepath.Join(dir, "dev-tools", ".locks", "tool.lock"), os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := waitFileLock(context.Background(), file.Fd()); err != nil {
		t.Fatal(err)
	}
	if err := unlockFile(file.Fd()); err != nil {
		t.Fatal(err)
	}
}

func TestManifestRetainsExplicitBuildIdentity(t *testing.T) {
	store, mem, opts := fixture(t)
	rec := requireUse(t, store, "tool", opts)
	data, err := mem.ReadFile(filepath.Join(store.root, "tool", "active.json"))
	if err != nil {
		t.Fatal(err)
	}
	var saved Record
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*rec, saved) {
		t.Fatalf("manifest mismatch: %+v", saved)
	}
}

func TestWindowsPayloadRetainsExecutableExtension(t *testing.T) {
	for _, test := range []struct{ name, source, platform, filename string }{
		{"dotfiles", "source.exe", "windows", "dotfiles.exe"},
		{"tool", "source.EXE", "windows", "tool.EXE"},
		{"tool", "source.com", "windows", "tool.com"},
		{"tool", "source.bat", "windows", "tool.bat"},
		{"tool", "source.cmd", "windows", "tool.cmd"},
		{"tool.exe", "source.exe", "windows", "tool.exe"},
		{"tool", "source", "windows", "tool"},
		{"tool", "source.exe", "linux", "tool"},
	} {
		t.Run(test.source+test.platform+test.name, func(t *testing.T) {
			store, mem, opts := fixture(t)
			store.targetOS = test.platform
			source := filepath.Join(opts.SourceRepo, test.source)
			if err := mem.WriteFile(source, []byte("executable"), 0755); err != nil {
				t.Fatal(err)
			}
			opts.Binaries = map[string]string{test.name: source}
			record := requireUse(t, store, "tool", opts)
			if filepath.Base(record.Binaries[test.name]) != test.filename {
				t.Fatalf("copied executable filename = %q, want %q", record.Binaries[test.name], test.filename)
			}
			if _, err := store.Lookup("tool"); err != nil {
				t.Fatal(err)
			}
			if err := store.Validate(record); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, duplicate := range []string{"tool.exe", "TOOL"} {
		store, mem, opts := fixture(t)
		store.targetOS = "windows"
		source := filepath.Join(opts.SourceRepo, "source.exe")
		if err := mem.WriteFile(source, []byte("executable"), 0755); err != nil {
			t.Fatal(err)
		}
		opts.Binaries = map[string]string{"tool": source, duplicate: source}
		if _, err := store.Use(context.Background(), "tool", opts); err == nil || !strings.Contains(err.Error(), "duplicates") {
			t.Fatalf("duplicate Windows payload accepted: %v", err)
		}
	}
}

func TestContainsRetainedPayload(t *testing.T) {
	mem := fs.NewMemFS()
	root := filepath.Join(t.TempDir(), "dev-tools")
	store := New(mem, root)
	for _, tc := range []struct {
		path string
		want bool
	}{
		{filepath.Join(root, "dotfiles", "build-old", "dotfiles"), true},
		{filepath.Join(root, "renamed", "build-old", "dotfiles.exe"), true},
		{filepath.Join(root, "dotfiles", "active.json"), false},
		{filepath.Join(root, "dotfiles", "other", "dotfiles"), false},
		{filepath.Join(root, "dotfiles", "build-old", "nested", "dotfiles"), false},
		{filepath.Join(root+"-other", "dotfiles", "build-old", "dotfiles"), false},
	} {
		if got, err := store.ContainsPayload(tc.path); err != nil || got != tc.want {
			t.Errorf("ContainsPayload(%q) = %v, %v; want %v", tc.path, got, err, tc.want)
		}
	}
	if err := mem.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	alias := root + "-alias"
	if err := mem.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	store = New(mem, alias)
	if got, err := store.ContainsPayload(filepath.Join(root, "dotfiles", "build-old", "dotfiles")); err != nil || !got {
		t.Fatalf("canonical payload through root alias = %v, %v", got, err)
	}
	if _, err := New(mem, "").ContainsPayload("/unknown"); err == nil {
		t.Fatal("empty store root accepted")
	}
	if err := mem.WriteFile(filepath.Join(root, "file"), []byte("file"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ContainsPayload(filepath.Join(root, "file", "dotfiles")); err == nil {
		t.Fatal("non-directory payload ancestor accepted")
	}
	if _, err := New(mem, filepath.Join(root, "file")).ContainsPayload("/unknown"); err == nil {
		t.Fatal("non-directory store root accepted")
	}
}
