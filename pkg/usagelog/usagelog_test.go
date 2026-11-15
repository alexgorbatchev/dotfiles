package usagelog

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/iotest"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestPaths(t *testing.T) {
	gen := filepath.Join("/", "proj", ".generated")
	if got, want := Dir(gen), filepath.Join(gen, "usage"); got != want {
		t.Fatalf("Dir = %q, want %q", got, want)
	}
	if got, want := Path(gen), filepath.Join(gen, "usage", "shim-usage.log"); got != want {
		t.Fatalf("Path = %q, want %q", got, want)
	}
}

func TestLastUsedMarkers(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	fsys := fs.NewOSFS()
	reg := newRegistry(t)
	tool := &config.ToolConfig{Name: "tools--bat", Binaries: []any{config.BinaryConfig{Name: "bat"}, config.BinaryConfig{Name: "bat-extra"}, config.BinaryConfig{Name: "unobserved"}}}
	if err := fsys.MkdirAll(MarkerDir(root), 0755); err != nil {
		t.Fatal(err)
	}
	stamp := time.Unix(1700000000, 0)
	for _, binary := range []string{"bat", "bat-extra"} {
		path := MarkerPath(root, tool.Name, binary)
		if err := fsys.WriteFile(path, nil, 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolUsage(ctx, tx, &registry.ToolUsageRecord{ToolName: tool.Name, BinaryName: "bat", UsageCount: 12, LastUsedAt: stamp.Add(-time.Hour).UnixMilli()})
	}); err != nil {
		t.Fatal(err)
	}
	res, err := Import(ctx, fsys, reg, root, nil, tool)
	if err != nil || res.Markers != 2 || res.Files != 0 {
		t.Fatalf("Import = %+v, %v; want two marker observations", res, err)
	}
	for _, binary := range []string{"bat", "bat-extra"} {
		got := mustUsage(t, reg, tool.Name, binary)
		wantCount := 0
		if binary == "bat" {
			wantCount = 12
		}
		if got.LastUsedAt != stamp.UnixMilli() || got.UsageCount != wantCount {
			t.Fatalf("%s = %+v, want timestamp %d and historical count %d", binary, got, stamp.UnixMilli(), wantCount)
		}
		info, err := fsys.Stat(MarkerPath(root, tool.Name, binary))
		if err != nil || info.Size() != 0 {
			t.Fatalf("marker removed or changed: %v, %v", info, err)
		}
	}
	if got, err := reg.GetToolUsage(ctx, tool.Name, "unobserved"); err != nil || got != nil {
		t.Fatalf("missing marker fabricated usage: %+v, %v", got, err)
	}
	for _, observedTime := range []time.Time{stamp, stamp.Add(-time.Hour)} {
		if err := os.Chtimes(MarkerPath(root, tool.Name, "bat"), observedTime, observedTime); err != nil {
			t.Fatal(err)
		}
		if n, err := RefreshMarkers(ctx, fsys, reg, root, tool); err != nil || n != 0 {
			t.Fatalf("repeated/older marker changed history: %d, %v", n, err)
		}
	}
	if got := mustUsage(t, reg, tool.Name, "bat"); got.UsageCount != 12 || got.LastUsedAt != stamp.UnixMilli() {
		t.Fatalf("history changed: %+v", got)
	}
}

func TestMarkerPathsSeparateIdentities(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "generated")
	paths := map[string]bool{}
	for _, pair := range [][2]string{{"a/b", "c"}, {"a", "b/c"}, {"a", "c"}, {"../../outside", "binary"}} {
		path := MarkerPath(root, pair[0], pair[1])
		if paths[path] || filepath.Dir(path) != MarkerDir(root) || len(filepath.Base(path)) != 69 {
			t.Fatalf("unsafe or ambiguous marker path: %s", path)
		}
		paths[path] = true
	}
}

type markerFailureFS struct {
	fs.FS
	path string
}

func (f markerFailureFS) Lstat(path string) (os.FileInfo, error) {
	if path == f.path {
		return nil, os.ErrPermission
	}
	return f.FS.Lstat(path)
}

func TestMarkerRefreshFailures(t *testing.T) {
	ctx := context.Background()
	root := filepath.Join(string(filepath.Separator), "generated")
	tool := &config.ToolConfig{Name: "tool", Binaries: []any{config.BinaryConfig{Name: "good"}, config.BinaryConfig{Name: "bad"}}}
	newMarkers := func(t *testing.T) fs.FS {
		t.Helper()
		mem := fs.NewMemFS()
		if err := mem.MkdirAll(MarkerDir(root), 0755); err != nil {
			t.Fatal(err)
		}
		if err := mem.WriteFile(MarkerPath(root, tool.Name, "good"), nil, 0600); err != nil {
			t.Fatal(err)
		}
		return mem
	}
	t.Run("continues after an unreadable marker", func(t *testing.T) {
		reg := newRegistry(t)
		fsys := markerFailureFS{FS: newMarkers(t), path: MarkerPath(root, tool.Name, "bad")}
		n, err := RefreshMarkers(ctx, fsys, reg, root, tool)
		if n != 1 || !errors.Is(err, os.ErrPermission) {
			t.Fatalf("RefreshMarkers = %d, %v", n, err)
		}
		mustUsage(t, reg, tool.Name, "good")
	})
	t.Run("rejects a directory and does not invent use", func(t *testing.T) {
		reg := newRegistry(t)
		fsys := newMarkers(t)
		if err := fsys.MkdirAll(MarkerPath(root, tool.Name, "bad"), 0755); err != nil {
			t.Fatal(err)
		}
		n, err := RefreshMarkers(ctx, fsys, reg, root, tool)
		if n != 1 || err == nil || !strings.Contains(err.Error(), "not a regular file") {
			t.Fatalf("RefreshMarkers = %d, %v", n, err)
		}
	})
	t.Run("cancellation stops metadata refresh", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		if n, err := RefreshMarkers(cancelled, newMarkers(t), newRegistry(t), root, tool); n != 0 || !errors.Is(err, context.Canceled) {
			t.Fatalf("RefreshMarkers = %d, %v", n, err)
		}
	})
	t.Run("failed transaction retains markers for retry", func(t *testing.T) {
		conn, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close() })
		if _, err := conn.ExecContext(ctx, `CREATE TRIGGER fail_usage BEFORE INSERT ON tool_usage BEGIN SELECT RAISE(ABORT, 'probe'); END;`); err != nil {
			t.Fatal(err)
		}
		fsys := newMarkers(t)
		reg := registry.NewRegistry(conn)
		if n, err := RefreshMarkers(ctx, fsys, reg, root, tool); n != 0 || err == nil || !strings.Contains(err.Error(), "recording last-used") {
			t.Fatalf("RefreshMarkers = %d, %v", n, err)
		}
		if _, err := conn.ExecContext(ctx, "DROP TRIGGER fail_usage"); err != nil {
			t.Fatal(err)
		}
		if n, err := RefreshMarkers(ctx, fsys, reg, root, tool); n != 1 || err != nil {
			t.Fatalf("retry = %d, %v", n, err)
		}
	})
}

type failedCleanupFS struct{ fs.FS }

func (f failedCleanupFS) Remove(string) error { return os.ErrPermission }

func TestLegacyCleanupRetryPreservesHistory(t *testing.T) {
	ctx := context.Background()
	root := filepath.Join(string(filepath.Separator), "generated")
	reg := newRegistry(t)
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolUsage(ctx, tx, &registry.ToolUsageRecord{ToolName: "bat", BinaryName: "bat", UsageCount: 7, LastUsedAt: 1})
	}); err != nil {
		t.Fatal(err)
	}
	fsys := failedCleanupFS{fs.NewMemFS()}
	writeLog(t, fsys, root, "v1\t1700000000\tbat\tbat\n")
	for range 2 {
		if _, err := Import(ctx, fsys, reg, root); !errors.Is(err, os.ErrPermission) {
			t.Fatalf("Import = %v, want failed cleanup", err)
		}
		got := mustUsage(t, reg, "bat", "bat")
		if got.UsageCount != 7 || got.LastUsedAt != 1700000000000 {
			t.Fatalf("retry changed historical counts or recency: %+v", got)
		}
	}
}

type interruptedLogFS struct {
	fs.FS
	reader io.ReadCloser
}

func (f interruptedLogFS) Open(string) (io.ReadCloser, error) { return f.reader, nil }

func TestLegacyStreamingFailurePreservesSource(t *testing.T) {
	for _, oversized := range []bool{false, true} {
		name := "interrupted read"
		if oversized {
			name = "oversized line"
		}
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			mem := fs.NewMemFS()
			reg := newRegistry(t)
			valid := "v1\t1700000000\tbat\tbat\n"
			writeLog(t, mem, root, valid)
			var reader io.Reader = io.MultiReader(strings.NewReader(valid), iotest.ErrReader(io.ErrUnexpectedEOF))
			if oversized {
				reader = strings.NewReader(valid + strings.Repeat("x", 1024*1024+1) + "\n")
			}
			fsys := interruptedLogFS{FS: mem, reader: io.NopCloser(reader)}
			result, err := Import(context.Background(), fsys, reg, root)
			if err == nil || result.Files != 0 {
				t.Fatalf("Import = %+v, %v; want retained failed input", result, err)
			}
			if record, err := reg.GetToolUsage(context.Background(), "bat", "bat"); err != nil || record != nil {
				t.Fatalf("partial read committed history: %+v, %v", record, err)
			}
			if paths, err := rotatedLogs(mem, root); err != nil || len(paths) != 1 {
				t.Fatalf("failed input was removed: %v, %v", paths, err)
			}
			if result, err := Import(context.Background(), mem, reg, root); err != nil || result.Files != 1 {
				t.Fatalf("retry after reader repair = %+v, %v", result, err)
			}
		})
	}
}

func TestParseLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want Entry
		ok   bool
	}{
		{"valid", "v1\t1700000000\tbat\tbat", Entry{"bat", "bat", time.Unix(1700000000, 0)}, true},
		{"valid with crlf", "v1\t1700000000\tripgrep\trg\r\n", Entry{"ripgrep", "rg", time.Unix(1700000000, 0)}, true},
		{"blank", "", Entry{}, false},
		{"whitespace only", "   \t ", Entry{}, false},
		{"three fields", "v1\t1700000000\tbat", Entry{}, false},
		{"five fields", "v1\t1700000000\tbat\tbat\textra", Entry{}, false},
		{"other version", "1\t1700000000\tbat\tbat", Entry{}, false},
		{"empty tool", "v1\t1700000000\t\tbat", Entry{}, false},
		{"empty binary", "v1\t1700000000\tbat\t", Entry{}, false},
		{"timestamp not a number", "v1\tyesterday\tbat\tbat", Entry{}, false},
		{"negative timestamp", "v1\t-5\tbat\tbat", Entry{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseLine(tt.line)
			if ok != tt.ok {
				t.Fatalf("ParseLine(%q) ok = %v, want %v", tt.line, ok, tt.ok)
			}
			if ok && (got.ToolName != tt.want.ToolName || got.BinaryName != tt.want.BinaryName || !got.UsedAt.Equal(tt.want.UsedAt)) {
				t.Fatalf("ParseLine(%q) = %+v, want %+v", tt.line, got, tt.want)
			}
		})
	}
}

func TestRotatedName(t *testing.T) {
	now := time.UnixMilli(1700000000123)
	if got, want := rotatedName(now, 42, 0), "shim-usage.log.1700000000123.42"; got != want {
		t.Fatalf("rotatedName(suffix 0) = %q, want %q", got, want)
	}
	if got, want := rotatedName(now, 42, 3), "shim-usage.log.1700000000123.42.3"; got != want {
		t.Fatalf("rotatedName(suffix 3) = %q, want %q", got, want)
	}
	for _, name := range []string{rotatedName(now, 42, 0), rotatedName(now, 42, 3)} {
		if !isRotatedName(name) {
			t.Fatalf("isRotatedName(%q) = false, want true", name)
		}
	}
	if isRotatedName("shim-usage.log") {
		t.Fatal("the active log must not count as rotated")
	}
}

// newRegistry opens an isolated in-memory registry.
func newRegistry(t *testing.T) *registry.Registry {
	t.Helper()
	conn, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("opening registry: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return registry.NewRegistry(conn)
}

// writeLog writes content as the active usage log under generatedDir.
func writeLog(t *testing.T, fsys fs.FS, generatedDir, content string) {
	t.Helper()
	if err := fsys.MkdirAll(Dir(generatedDir), 0755); err != nil {
		t.Fatalf("creating usage dir: %v", err)
	}
	if err := fsys.WriteFile(Path(generatedDir), []byte(content), 0644); err != nil {
		t.Fatalf("writing usage log: %v", err)
	}
}

func mustUsage(t *testing.T, reg *registry.Registry, tool, binary string) *registry.ToolUsageRecord {
	t.Helper()
	rec, err := reg.GetToolUsage(context.Background(), tool, binary)
	if err != nil {
		t.Fatalf("reading usage of %s/%s: %v", tool, binary, err)
	}
	if rec == nil {
		t.Fatalf("no usage recorded for %s/%s", tool, binary)
	}
	return rec
}

func TestImport(t *testing.T) {
	ctx := context.Background()
	generatedDir := filepath.Join(string(filepath.Separator), "proj", ".generated")

	t.Run("folds the active log into the registry and deletes it", func(t *testing.T) {
		memFS := fs.NewMemFS()
		reg := newRegistry(t)
		writeLog(t, memFS, generatedDir, strings.Join([]string{
			"v1\t1700000000\tbat\tbat",
			"v1\t1700000300\tbat\tbat",
			"v1\t1700000100\tbat\tbat", // older than the previous event: must not win lastUsedAt
			"v1\t1700000200\tripgrep\trg",
			"garbage line",
			"",
			"v0\t1700000400\tbat\tbat", // unknown version
		}, "\n")+"\n")

		res, err := Import(ctx, memFS, reg, generatedDir)
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if res != (Result{Files: 1, Events: 4, InvalidLines: 2}) {
			t.Fatalf("result = %+v, want 1 file, 4 events, 2 invalid lines", res)
		}

		bat := mustUsage(t, reg, "bat", "bat")
		if bat.UsageCount != 0 || bat.LastUsedAt != time.Unix(1700000300, 0).UnixMilli() {
			t.Fatalf("bat usage = %+v, want unchanged count 0 and lastUsedAt of the latest event in ms", bat)
		}
		rg := mustUsage(t, reg, "ripgrep", "rg")
		if rg.UsageCount != 0 || rg.LastUsedAt != time.Unix(1700000200, 0).UnixMilli() {
			t.Fatalf("rg usage = %+v, want unchanged count 0", rg)
		}

		if exists, _ := memFS.Exists(Path(generatedDir)); exists {
			t.Fatal("the active log must be rotated away")
		}
		entries, err := memFS.ReadDir(Dir(generatedDir))
		if err != nil {
			t.Fatalf("listing usage dir: %v", err)
		}
		if len(entries) != 0 {
			t.Fatalf("usage dir still holds %v, want every imported file deleted", entries)
		}
	})

	t.Run("merges recency across runs and picks up leftover rotated logs", func(t *testing.T) {
		memFS := fs.NewMemFS()
		reg := newRegistry(t)

		// A rotated file left behind by an importer that died before deleting it.
		leftover := filepath.Join(Dir(generatedDir), rotatedName(time.UnixMilli(1), 7, 0))
		if err := memFS.MkdirAll(Dir(generatedDir), 0755); err != nil {
			t.Fatalf("creating usage dir: %v", err)
		}
		if err := memFS.WriteFile(leftover, []byte("v1\t1700000000\tbat\tbat\n"), 0644); err != nil {
			t.Fatalf("writing leftover log: %v", err)
		}
		writeLog(t, memFS, generatedDir, "v1\t1700000500\tbat\tbat\n")

		res, err := Import(ctx, memFS, reg, generatedDir)
		if err != nil {
			t.Fatalf("first Import: %v", err)
		}
		if res != (Result{Files: 2, Events: 2}) {
			t.Fatalf("result = %+v, want both files imported", res)
		}
		if bat := mustUsage(t, reg, "bat", "bat"); bat.UsageCount != 0 {
			t.Fatalf("bat usage = %+v, want unchanged count 0", bat)
		}

		writeLog(t, memFS, generatedDir, "v1\t1700000600\tbat\tbat\n")
		if _, err := Import(ctx, memFS, reg, generatedDir); err != nil {
			t.Fatalf("second Import: %v", err)
		}
		bat := mustUsage(t, reg, "bat", "bat")
		if bat.UsageCount != 0 || bat.LastUsedAt != time.Unix(1700000600, 0).UnixMilli() {
			t.Fatalf("bat usage = %+v, want unchanged count 0 with the newest event", bat)
		}
	})

	t.Run("nothing to import", func(t *testing.T) {
		memFS := fs.NewMemFS()
		reg := newRegistry(t)

		res, err := Import(ctx, memFS, reg, generatedDir)
		if err != nil {
			t.Fatalf("Import without a usage dir: %v", err)
		}
		if res != (Result{}) {
			t.Fatalf("result = %+v, want empty", res)
		}

		if err := memFS.MkdirAll(Dir(generatedDir), 0755); err != nil {
			t.Fatalf("creating usage dir: %v", err)
		}
		if err := memFS.WriteFile(filepath.Join(Dir(generatedDir), "notes.txt"), []byte("x"), 0644); err != nil {
			t.Fatalf("writing unrelated file: %v", err)
		}
		res, err = Import(ctx, memFS, reg, generatedDir)
		if err != nil {
			t.Fatalf("Import with an empty usage dir: %v", err)
		}
		if res != (Result{}) {
			t.Fatalf("result = %+v, want empty: unrelated files are not logs", res)
		}
	})

	t.Run("rotation skips taken names", func(t *testing.T) {
		memFS := fs.NewMemFS()
		now := time.UnixMilli(1700000000123)
		writeLog(t, memFS, generatedDir, "v1\t1700000000\tbat\tbat\n")
		taken := filepath.Join(Dir(generatedDir), rotatedName(now, 9, 0))
		if err := memFS.WriteFile(taken, []byte("older\n"), 0644); err != nil {
			t.Fatalf("writing taken name: %v", err)
		}

		if err := rotateActiveLog(memFS, generatedDir, now, 9); err != nil {
			t.Fatalf("rotateActiveLog: %v", err)
		}
		rotated, err := rotatedLogs(memFS, generatedDir)
		if err != nil {
			t.Fatalf("rotatedLogs: %v", err)
		}
		want := []string{taken, filepath.Join(Dir(generatedDir), rotatedName(now, 9, 1))}
		if len(rotated) != 2 || rotated[0] != want[0] || rotated[1] != want[1] {
			t.Fatalf("rotated = %v, want %v", rotated, want)
		}
	})

	t.Run("registry failure keeps the file for the next run", func(t *testing.T) {
		memFS := fs.NewMemFS()
		conn, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatalf("opening registry: %v", err)
		}
		reg := registry.NewRegistry(conn)
		conn.Close()
		writeLog(t, memFS, generatedDir, "v1\t1700000000\tbat\tbat\n")

		res, err := Import(ctx, memFS, reg, generatedDir)
		if err == nil {
			t.Fatal("Import against a closed registry must fail")
		}
		if res.Files != 0 {
			t.Fatalf("result = %+v, want no file counted as imported", res)
		}
		rotated, err := rotatedLogs(memFS, generatedDir)
		if err != nil {
			t.Fatalf("rotatedLogs: %v", err)
		}
		if len(rotated) != 1 {
			t.Fatalf("rotated = %v, want the rotated log kept for the next run", rotated)
		}
	})

	t.Run("rotation gives up when every name is taken", func(t *testing.T) {
		memFS := fs.NewMemFS()
		now := time.UnixMilli(1700000000123)
		writeLog(t, memFS, generatedDir, "v1\t1700000000\tbat\tbat\n")
		for suffix := 0; suffix < maxRotationSuffix; suffix++ {
			taken := filepath.Join(Dir(generatedDir), rotatedName(now, 9, suffix))
			if err := memFS.WriteFile(taken, []byte("x"), 0644); err != nil {
				t.Fatalf("writing taken name %d: %v", suffix, err)
			}
		}

		err := rotateActiveLog(memFS, generatedDir, now, 9)
		if err == nil || !strings.Contains(err.Error(), "no free rotated name") {
			t.Fatalf("error = %v, want the exhausted-names failure", err)
		}
		if exists, _ := memFS.Exists(Path(generatedDir)); !exists {
			t.Fatal("the active log must stay in place when rotation fails")
		}
	})

	t.Run("a directory named like a rotated log is reported", func(t *testing.T) {
		memFS := fs.NewMemFS()
		reg := newRegistry(t)
		bogus := filepath.Join(Dir(generatedDir), rotatedName(time.UnixMilli(1), 7, 0))
		if err := memFS.MkdirAll(bogus, 0755); err != nil {
			t.Fatalf("creating bogus dir: %v", err)
		}

		_, err := Import(ctx, memFS, reg, generatedDir)
		if err == nil || !strings.Contains(err.Error(), "reading usage log "+bogus) {
			t.Fatalf("error = %v, want the read failure naming %s", err, bogus)
		}
	})

	t.Run("a usage dir that is a file is reported", func(t *testing.T) {
		memFS := fs.NewMemFS()
		reg := newRegistry(t)
		if err := memFS.MkdirAll(generatedDir, 0755); err != nil {
			t.Fatalf("creating generated dir: %v", err)
		}
		if err := memFS.WriteFile(Dir(generatedDir), []byte("not a directory"), 0644); err != nil {
			t.Fatalf("writing file at the usage dir path: %v", err)
		}

		_, err := Import(ctx, memFS, reg, generatedDir)
		if err == nil || !strings.Contains(err.Error(), "listing usage log directory") {
			t.Fatalf("error = %v, want the directory listing failure", err)
		}
	})

	t.Run("a failed insert keeps the file and reports the path", func(t *testing.T) {
		memFS := fs.NewMemFS()
		conn, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatalf("opening registry: %v", err)
		}
		t.Cleanup(func() { conn.Close() })
		if _, err := conn.ExecContext(ctx, "DROP TABLE tool_usage"); err != nil {
			t.Fatalf("dropping tool_usage: %v", err)
		}
		reg := registry.NewRegistry(conn)
		writeLog(t, memFS, generatedDir, "v1\t1700000000\tbat\tbat\n")

		_, err = Import(ctx, memFS, reg, generatedDir)
		if err == nil || !strings.Contains(err.Error(), "recording usage from ") {
			t.Fatalf("error = %v, want the recording failure", err)
		}
		rotated, err := rotatedLogs(memFS, generatedDir)
		if err != nil {
			t.Fatalf("rotatedLogs: %v", err)
		}
		if len(rotated) != 1 {
			t.Fatalf("rotated = %v, want the log kept for the next run", rotated)
		}
	})

	t.Run("on disk with the real filesystem", func(t *testing.T) {
		root := t.TempDir()
		osFS := fs.NewOSFS()
		reg := newRegistry(t)
		writeLog(t, osFS, root, "v1\t1700000000\tbat\tbat\n")

		res, err := Import(ctx, osFS, reg, root)
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if res != (Result{Files: 1, Events: 1}) {
			t.Fatalf("result = %+v, want one file with one event", res)
		}
		entries, err := os.ReadDir(Dir(root))
		if err != nil {
			t.Fatalf("listing usage dir: %v", err)
		}
		if len(entries) != 0 {
			t.Fatalf("usage dir still holds %d entries, want none", len(entries))
		}
	})
}
