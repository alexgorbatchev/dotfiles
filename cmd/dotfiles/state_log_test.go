package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestLogCommand_OperationsAndStatus(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install("manual")`})

	existing := filepath.Join(p.TargetDir, "bat")
	if err := os.WriteFile(existing, []byte("bin!"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}
	missingLink := filepath.Join(p.TargetDir, "bat-link")
	missingTarget := filepath.Join(p.Root, "nowhere", "bat")
	size := int64(4)
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      existing,
			FileType:      "binary",
			SizeBytes:     &size,
			CreatedAt:     time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC).UnixMilli(),
		}); err != nil {
			return err
		}
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "symlink",
			FilePath:      missingLink,
			TargetPath:    &missingTarget,
			FileType:      "symlink",
			CreatedAt:     time.Date(2024, 1, 3, 3, 4, 5, 0, time.UTC).UnixMilli(),
		})
	})

	t.Run("history in human mode", func(t *testing.T) {
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] write", "(binary)", "[bat] symlink", "(symlink)")
		mustContain(t, "stderr", out.Stderr, "Reading operation history and logs")
	})

	t.Run("history in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "tool:bat op:write path:", "type:binary", "tool:bat op:symlink path:")
	})

	t.Run("history as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--json")
		if err != nil {
			t.Fatalf("state log --json: %v\n%s", err, out.Combined)
		}
		var ops []map[string]any
		if err := json.Unmarshal([]byte(out.Stdout), &ops); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(ops) != 2 {
			t.Fatalf("got %d operations, want the 2 seeded ones", len(ops))
		}
	})

	t.Run("type filter", func(t *testing.T) {
		out, err := p.run("state", "log", "--type", "symlink")
		if err != nil {
			t.Fatalf("state log --type symlink: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] symlink")
		mustNotContain(t, "stdout", out.Stdout, "[bat] write")
	})

	t.Run("since filter keeps operations after the date", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "2024-01-03")
		if err != nil {
			t.Fatalf("state log --since: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] symlink")
		mustNotContain(t, "stdout", out.Stdout, "[bat] write")
	})

	t.Run("since filter with no matches falls back to disk logs", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "2030-01-01")
		if err != nil {
			t.Fatalf("state log --since: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "No log entries found.\n" {
			t.Fatalf("stdout = %q, want the no-entries message", out.Stdout)
		}
	})

	t.Run("an unparsable since date is ignored", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "yesterday")
		if err != nil {
			t.Fatalf("state log --since yesterday: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] write", "[bat] symlink")
	})

	t.Run("status in human mode", func(t *testing.T) {
		out, err := p.run("state", "log", "--status")
		if err != nil {
			t.Fatalf("state log --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"File states for bat:\n",
			"[OK] "+existing+" [binary] - exists (4 bytes)\n",
			"[MISSING] "+missingLink+" [symlink] - MISSING\n",
			"[MISSING ->] "+missingTarget+"\n",
		)
	})

	t.Run("status for one tool", func(t *testing.T) {
		out, err := p.run("state", "log", "bat", "--status")
		if err != nil {
			t.Fatalf("state log bat --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "File states for bat:\n")

		out, err = p.run("state", "log", "ghost", "--status")
		if err != nil {
			t.Fatalf("state log ghost --status: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "" {
			t.Fatalf("stdout for a tool without states = %q, want empty", out.Stdout)
		}
	})

	t.Run("status in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("state", "log", "--status")
		if err != nil {
			t.Fatalf("state log --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"tool:bat path:"+existing+" type:binary exists:true size:4 target:\n",
			"tool:bat path:"+missingLink+" type:symlink exists:false size:0 target:"+missingTarget+"\n",
		)
	})

	t.Run("status as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json: %v\n%s", err, out.Combined)
		}
		var states []FileStateInfo
		if err := json.Unmarshal([]byte(out.Stdout), &states); err != nil {
			t.Fatalf("stdout is not a JSON array of states: %v\n%s", err, out.Stdout)
		}
		var sawExisting bool
		for _, s := range states {
			if s.FilePath == existing && s.Exists && s.SizeBytes != nil && *s.SizeBytes == 4 {
				sawExisting = true
			}
		}
		if !sawExisting {
			t.Fatalf("states = %+v, want the existing binary with its size", states)
		}
	})
}

func TestLogStatusReportsInspectionFailures(t *testing.T) {
	for _, mode := range []string{"human", "agent", "json"} {
		for _, failure := range []string{"file", "target"} {
			t.Run(mode+"/"+failure, func(t *testing.T) {
				t.Setenv("AGENT", "0")
				if mode == "agent" {
					t.Setenv("AGENT", "1")
				}
				p := newE2EProject(t, tsTools{"a-broken": `install()`, "z-good": `install()`})
				loop := filepath.Join(p.TargetDir, "loop")
				if err := os.Symlink(loop, loop); err != nil {
					t.Fatal(err)
				}
				broken := loop
				var target *string
				if failure == "target" {
					broken = filepath.Join(p.TargetDir, "broken-target-record")
					target = &loop
					if err := os.WriteFile(broken, []byte("existing"), 0644); err != nil {
						t.Fatal(err)
					}
				}
				healthy := filepath.Join(p.TargetDir, "healthy")
				if err := os.WriteFile(healthy, []byte("healthy"), 0644); err != nil {
					t.Fatal(err)
				}
				p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
					for _, record := range []*registry.FileOperationRecord{
						{ToolName: "a-broken", FilePath: broken, TargetPath: target, FileType: "symlink", OperationType: "write"},
						{ToolName: "z-good", FilePath: healthy, FileType: "binary", OperationType: "write"},
					} {
						if err := reg.RecordFileOperation(ctx, tx, record); err != nil {
							return err
						}
					}
					return nil
				})
				args := []string{"state", "log", "--status"}
				if mode == "json" {
					args = append(args, "--json")
				}
				out, err := p.run(args...)
				if err == nil {
					t.Fatalf("status succeeded despite an uninspectable %s\n%s", failure, out.Combined)
				}
				mustContain(t, "stderr", out.Stderr, "[a-broken]", "loop")
				mustContain(t, "stdout", out.Stdout, "z-good", "healthy")
				mustNotContain(t, "stdout", out.Stdout, "a-broken", "loop", "broken-target-record", "MISSING")
				if mode == "json" {
					var states []FileStateInfo
					if err := json.Unmarshal([]byte(out.Stdout), &states); err != nil {
						t.Fatalf("invalid JSON status: %v\n%s", err, out.Stdout)
					}
					if len(states) != 1 || states[0].FilePath != healthy || !states[0].Exists {
						t.Errorf("partial status = %+v, want only healthy existing file", states)
					}
				}
			})
		}
	}
}

func TestLogStatusReportsRegistryFailures(t *testing.T) {
	for _, named := range []bool{false, true} {
		t.Run(fmt.Sprintf("named=%t", named), func(t *testing.T) {
			p := newE2EProject(t, tsTools{"broken": `install()`})
			p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
				return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
					ToolName: "broken", FilePath: filepath.Join(p.TargetDir, "broken"), FileType: "binary", OperationType: "write",
				})
			})
			p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, "UPDATE file_operations SET size_bytes = 'invalid-size' WHERE tool_name = 'broken'")
				return err
			})
			args := []string{"state", "log", "--status", "--json"}
			if named {
				args = append(args, "broken")
			}
			out, err := p.run(args...)
			if err == nil {
				t.Fatalf("status succeeded despite unreadable registry records\n%s", out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "invalid-size")
		})
	}
}

func TestLogCommand_DiskLogFallback(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install("manual")`})

	t.Run("nothing recorded", func(t *testing.T) {
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "No log entries found.\n" {
			t.Fatalf("stdout = %q, want the no-entries message", out.Stdout)
		}
		out, err = p.run("state", "log", "--json")
		if err != nil {
			t.Fatalf("state log --json: %v\n%s", err, out.Combined)
		}
		if strings.TrimSpace(out.Stdout) != "[]" {
			t.Fatalf("stdout = %q, want an empty JSON array", out.Stdout)
		}
	})

	logPath := filepath.Join(p.GeneratedDir, "dotfiles.log")
	if err := os.WriteFile(logPath, []byte("one\ntwo\nthree\n"), 0644); err != nil {
		t.Fatalf("writing log: %v", err)
	}

	t.Run("tail of the generated log", func(t *testing.T) {
		out, err := p.run("state", "log", "--tail", "2")
		if err != nil {
			t.Fatalf("state log --tail 2: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "two\nthree\n" {
			t.Fatalf("stdout = %q, want the last two lines", out.Stdout)
		}
		mustContain(t, "stderr", out.Stderr, "Reading log file: "+logPath)

		out, err = p.run("state", "log", "--tail", "0")
		if err != nil {
			t.Fatalf("state log --tail 0: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "one\ntwo\nthree\n" {
			t.Fatalf("stdout = %q, want every line", out.Stdout)
		}
	})

	t.Run("tail as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--tail", "2", "--json")
		if err != nil {
			t.Fatalf("state log --tail 2 --json: %v\n%s", err, out.Combined)
		}
		var lines []string
		if err := json.Unmarshal([]byte(out.Stdout), &lines); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if !slices.Equal(lines, []string{"two", "three"}) {
			t.Fatalf("lines = %v, want the last two", lines)
		}
	})

	t.Run("legacy usage is imported before reading the generated log", func(t *testing.T) {
		usagePath := filepath.Join(p.GeneratedDir, "usage", "shim-usage.log")
		if err := os.MkdirAll(filepath.Dir(usagePath), 0755); err != nil {
			t.Fatalf("creating usage dir: %v", err)
		}
		if err := os.WriteFile(usagePath, []byte("v1\t1700000000\tbat\tbat\n"), 0644); err != nil {
			t.Fatalf("writing usage log: %v", err)
		}
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "one\ntwo\nthree\n" {
			t.Fatalf("stdout = %q, want the generated log after legacy import", out.Stdout)
		}
		mustContain(t, "stderr", out.Stderr, "Reading log file: "+logPath)
		if _, err := os.Stat(usagePath); !os.IsNotExist(err) {
			t.Fatalf("legacy usage log remains after import: %v", err)
		}
	})
}
