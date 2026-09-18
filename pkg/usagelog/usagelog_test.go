package usagelog

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
		if bat.UsageCount != 3 || bat.LastUsedAt != time.Unix(1700000300, 0).UnixMilli() {
			t.Fatalf("bat usage = %+v, want count 3 and lastUsedAt of the latest event in ms", bat)
		}
		rg := mustUsage(t, reg, "ripgrep", "rg")
		if rg.UsageCount != 1 || rg.LastUsedAt != time.Unix(1700000200, 0).UnixMilli() {
			t.Fatalf("rg usage = %+v, want count 1", rg)
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

	t.Run("accumulates across runs and picks up leftover rotated logs", func(t *testing.T) {
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
		if bat := mustUsage(t, reg, "bat", "bat"); bat.UsageCount != 2 {
			t.Fatalf("bat usage = %+v, want count 2", bat)
		}

		writeLog(t, memFS, generatedDir, "v1\t1700000600\tbat\tbat\n")
		if _, err := Import(ctx, memFS, reg, generatedDir); err != nil {
			t.Fatalf("second Import: %v", err)
		}
		bat := mustUsage(t, reg, "bat", "bat")
		if bat.UsageCount != 3 || bat.LastUsedAt != time.Unix(1700000600, 0).UnixMilli() {
			t.Fatalf("bat usage = %+v, want count 3 with the newest event", bat)
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
