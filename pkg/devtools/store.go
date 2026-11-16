// Package devtools owns copied development executables and their active selections.
// Release installation receipts remain independent of these machine-local overrides.
package devtools

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// Record identifies one active development build. Binaries contains absolute paths
// to immutable copied executables, so a failed subsequent deployment cannot damage it.
type Record struct {
	Tool       string            `json:"tool"`
	Version    string            `json:"version,omitempty"`
	SourceRepo string            `json:"sourceRepo,omitempty"`
	Generation string            `json:"generation"`
	Binaries   map[string]string `json:"binaries"`
}

// UseOptions supplies the executable names and source files to copy into the store.
type UseOptions struct {
	Binaries   map[string]string
	Version    string
	SourceRepo string
}

// Store reads and writes overrides through the injected filesystem.
type Store struct {
	fs       fs.FS
	root     string
	targetOS string
}

// New creates a store. It creates no files until a mutation takes its lock.
func New(fsys fs.FS, root string) *Store {
	return &Store{fs: fs.Untracked(fsys), root: root, targetOS: runtime.GOOS}
}

// ContainsPayload identifies an executable in this store, including retained
// inactive generations. It does not require an active selection or a live file.
func (s *Store) ContainsPayload(path string) (bool, error) {
	if s.root == "" {
		return false, fmt.Errorf("development tools directory is empty")
	}
	root, err := resolveDirectory(s.fs, s.root)
	if err != nil {
		return false, err
	}
	parent, err := resolveDirectory(s.fs, filepath.Dir(path))
	if err != nil {
		return false, err
	}
	relative, err := filepath.Rel(root, parent)
	if err != nil {
		return false, err
	}
	parts := strings.Split(relative, string(filepath.Separator))
	return len(parts) == 2 && validName(parts[0]) && validName(parts[1]) && strings.HasPrefix(parts[1], "build-") && validName(filepath.Base(path)), nil
}

func validName(name string) bool {
	if name == "" || name == "." || name == ".." || strings.TrimSpace(name) != name {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.') {
			return false
		}
	}
	return name[0] != '.' && name[len(name)-1] != '.'
}

func (s *Store) directory(tool string) (string, error) {
	if !validName(tool) {
		return "", fmt.Errorf("invalid development tool name %q", tool)
	}
	if s.root == "" {
		return "", fmt.Errorf("development tools directory is empty")
	}
	root, err := s.fs.Abs(s.root)
	if err != nil {
		return "", fmt.Errorf("resolving development tools directory: %w", err)
	}
	return filepath.Join(root, tool), nil
}

// Lookup reads selection metadata without requiring the payload to exist. An
// incomplete development install must remain protected from release replacement.
func (s *Store) Lookup(tool string) (*Record, error) {
	dir, err := s.directory(tool)
	if err != nil {
		return nil, err
	}
	if err := s.inspectDirectory(dir); err != nil {
		return nil, err
	}
	manifest := filepath.Join(dir, "active.json")
	info, err := s.fs.Lstat(manifest)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("inspecting development override for %s: %w", tool, err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("development override for %s is not a regular file", tool)
	}
	data, err := s.fs.ReadFile(manifest)
	if err != nil {
		return nil, fmt.Errorf("reading development override for %s: %w", tool, err)
	}
	var rec Record
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, fmt.Errorf("decoding development override for %s: %w", tool, err)
	}
	if err := s.validateRecord(tool, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

func (s *Store) validateRecord(tool string, rec *Record) error {
	dir, err := s.directory(tool)
	if err != nil {
		return err
	}
	if rec.Tool != tool || !validName(rec.Generation) || !strings.HasPrefix(rec.Generation, "build-") || len(rec.Binaries) == 0 {
		return fmt.Errorf("invalid development override for %s", tool)
	}
	for name, path := range rec.Binaries {
		if !validName(name) || path != filepath.Join(dir, rec.Generation, payloadName(name, path, s.targetOS)) {
			return fmt.Errorf("invalid development executable %q for %s", name, tool)
		}
	}
	return nil
}

// Validate checks that every executable in a record is present and runnable.
// Lookup deliberately does not perform this check, allowing missing builds to stay
// protected and to be explicitly disabled or replaced.
func (s *Store) Validate(rec *Record) error {
	if rec == nil {
		return fmt.Errorf("development override is nil")
	}
	if err := s.validateRecord(rec.Tool, rec); err != nil {
		return err
	}
	for _, name := range sortedNames(rec.Binaries) {
		info, err := s.fs.Lstat(rec.Binaries[name])
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("development executable %s for %s is missing or is not a regular file: %w", name, rec.Tool, errors.Join(err, os.ErrInvalid))
		}
		if err := s.inspectDirectory(filepath.Dir(rec.Binaries[name])); err != nil {
			return err
		}
		if err := s.executable(rec.Binaries[name]); err != nil {
			return fmt.Errorf("development executable %s for %s: %w", name, rec.Tool, err)
		}
	}
	return nil
}

func (s *Store) executable(path string) error {
	info, err := s.fs.Stat(path)
	if err != nil {
		return fmt.Errorf("inspecting %s: %w", path, err)
	}
	if !info.Mode().IsRegular() || !executableMode(info.Mode()) {
		return fmt.Errorf("%s is not a regular executable file", path)
	}
	return nil
}

// Use copies a complete build before atomically publishing its selection. Old
// builds remain usable until callers migrate every referencing shim and call Prune.
func (s *Store) Use(ctx context.Context, tool string, opts UseOptions) (*Record, error) {
	var result *Record
	err := s.WithLock(ctx, tool, func(ctx context.Context) error {
		var err error
		result, err = s.use(ctx, tool, opts)
		return err
	})
	return result, err
}

func (s *Store) use(ctx context.Context, tool string, opts UseOptions) (_ *Record, err error) {
	if len(opts.Binaries) == 0 {
		return nil, fmt.Errorf("development build for %s contains no executables", tool)
	}
	dir, err := s.directory(tool)
	if err != nil {
		return nil, err
	}
	if _, err := s.Lookup(tool); err != nil {
		return nil, err
	}
	if err := s.ensureDirectory(dir); err != nil {
		return nil, err
	}
	rec := &Record{Tool: tool, Version: opts.Version, Generation: "build-" + rand.Text(), Binaries: make(map[string]string)}
	if opts.SourceRepo != "" {
		rec.SourceRepo, err = s.fs.Abs(opts.SourceRepo)
		if err != nil {
			return nil, fmt.Errorf("resolving development source repository: %w", err)
		}
	}
	buildDir := filepath.Join(dir, rec.Generation)
	if err := s.ensureDirectory(buildDir); err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, s.fs.RemoveAll(buildDir))
		}
	}()
	destinations := make(map[string]bool, len(opts.Binaries))
	for _, name := range sortedNames(opts.Binaries) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if !validName(name) {
			return nil, fmt.Errorf("invalid development executable name %q", name)
		}
		source, err := s.fs.Abs(opts.Binaries[name])
		if err != nil {
			return nil, fmt.Errorf("resolving development executable %s: %w", name, err)
		}
		if err := s.executable(source); err != nil {
			return nil, err
		}
		filename := payloadName(name, source, s.targetOS)
		identity := filename
		if s.targetOS == "windows" {
			identity = strings.ToLower(identity)
		}
		if destinations[identity] {
			return nil, fmt.Errorf("development executable %q duplicates another payload filename", name)
		}
		destinations[identity] = true
		dest := filepath.Join(buildDir, filename)
		if err := s.fs.CopyFile(source, dest); err != nil {
			return nil, fmt.Errorf("copying development executable %s: %w", name, err)
		}
		rec.Binaries[name] = dest
	}
	if err := s.publish(tool, rec); err != nil {
		return nil, err
	}
	return rec, nil
}

// Off deactivates an override while retaining its payload for existing shims.
// Callers may Prune only after migrating every referencing shim.
func (s *Store) Off(ctx context.Context, tool string) error { return s.Restore(ctx, tool, nil) }

// Restore publishes an earlier record, or deactivates the override when rec is nil.
// Callers use it to roll back a registration whose subsequent shim generation failed.
func (s *Store) Restore(ctx context.Context, tool string, rec *Record) error {
	return s.WithLock(ctx, tool, func(context.Context) error { return s.publish(tool, rec) })
}

func (s *Store) publish(tool string, rec *Record) (err error) {
	dir, err := s.directory(tool)
	if err != nil {
		return err
	}
	if err := s.inspectDirectory(dir); err != nil {
		return err
	}
	manifest := filepath.Join(dir, "active.json")
	if rec == nil {
		if err := s.fs.Remove(manifest); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("disabling development override for %s: %w", tool, err)
		}
		return nil
	}
	if err := s.validateRecord(tool, rec); err != nil {
		return err
	}
	if err := s.ensureDirectory(dir); err != nil {
		return err
	}
	data, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding development override for %s: %w", tool, err)
	}
	tmp := filepath.Join(dir, ".active-"+rand.Text())
	defer func() {
		if err != nil {
			cleanupErr := s.fs.Remove(tmp)
			if !errors.Is(cleanupErr, os.ErrNotExist) {
				err = errors.Join(err, cleanupErr)
			}
		}
	}()
	if err := s.fs.WriteFile(tmp, append(data, '\n'), 0600); err != nil {
		return fmt.Errorf("writing development override for %s: %w", tool, err)
	}
	if err := s.fs.Rename(tmp, manifest); err != nil {
		return fmt.Errorf("publishing development override for %s: %w", tool, err)
	}
	return nil
}

// Prune removes inactive build generations after consumers have regenerated shims.
// It never removes the active build, tool directory, or shared lock files.
func (s *Store) Prune(ctx context.Context, tool string) error {
	return s.WithLock(ctx, tool, func(ctx context.Context) error {
		rec, err := s.Lookup(tool)
		if err != nil {
			return err
		}
		dir, err := s.directory(tool)
		if err != nil {
			return err
		}
		names, err := s.fs.ReadDir(dir)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("reading development builds for %s: %w", tool, err)
		}
		for _, name := range names {
			if err := ctx.Err(); err != nil {
				return err
			}
			if !strings.HasPrefix(name, "build-") || !validName(name) || rec != nil && rec.Generation == name {
				continue
			}
			if err := s.fs.RemoveAll(filepath.Join(dir, name)); err != nil {
				return fmt.Errorf("removing old development build for %s: %w", tool, err)
			}
		}
		return nil
	})
}

// List returns active overrides sorted by tool name. Corrupt metadata is an error,
// never evidence that the corresponding release can safely replace a dev build.
func (s *Store) List() ([]Record, error) {
	if s.root == "" {
		return nil, fmt.Errorf("development tools directory is empty")
	}
	names, err := s.fs.ReadDir(s.root)
	if errors.Is(err, os.ErrNotExist) {
		return []Record{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("listing development overrides: %w", err)
	}
	sort.Strings(names)
	records := make([]Record, 0)
	for _, name := range names {
		if strings.HasPrefix(name, ".") {
			continue
		}
		rec, err := s.Lookup(name)
		if err != nil {
			return nil, err
		}
		if rec != nil {
			records = append(records, *rec)
		}
	}
	return records, nil
}

func (s *Store) ensureDirectory(path string) error {
	if err := s.fs.MkdirAll(path, 0700); err != nil {
		return fmt.Errorf("creating development directory %s: %w", path, err)
	}
	return s.inspectDirectory(path)
}

func (s *Store) inspectDirectory(path string) error {
	info, err := s.fs.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspecting development directory %s: %w", path, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("development directory %s is not a directory", path)
	}
	return nil
}

func sortedNames(values map[string]string) []string {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Windows resolves executable paths by their extension even when the absolute
// path is given. Retain the source suffix while keeping the declared command key.
func payloadName(name, source, targetOS string) string {
	if targetOS != "windows" || executableExtension(filepath.Ext(name)) {
		return name
	}
	ext := filepath.Ext(source)
	if executableExtension(ext) {
		return name + ext
	}
	return name
}

func executableExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".exe", ".com", ".bat", ".cmd":
		return true
	default:
		return false
	}
}
