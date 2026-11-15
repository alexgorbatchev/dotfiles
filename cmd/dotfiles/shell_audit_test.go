package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDetectConflictsCommand_ErrorReturn(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	tmpDir := t.TempDir()
	targetDir := filepath.Join(tmpDir, "target")
	_ = os.MkdirAll(targetDir, 0755)

	conflictFile := filepath.Join(targetDir, "bat")
	if err := os.WriteFile(conflictFile, []byte("#!/bin/sh\necho not-a-shim"), 0755); err != nil {
		t.Fatalf("failed creating conflict file: %v", err)
	}

	configPath := writeTSProject(t, tmpDir,
		fmt.Sprintf(`"paths": {"homeDir": %q, "targetDir": %q, "generatedDir": %q}`, filepath.ToSlash(tmpDir), filepath.ToSlash(targetDir), filepath.ToSlash(tmpDir)),
		tsTools{"github-release--bat": `install("github-release", { repo: "sharkdp/bat" }).bin("bat")`})

	_, err := executeCommand("-c", configPath, "shell", "audit")
	if err == nil {
		t.Fatalf("expected shell audit to return error when non-generator file exists")
	}
	if !strings.Contains(err.Error(), "conflicts detected") {
		t.Errorf("expected conflict error message, got: %v", err)
	}
}

func TestShellAuditReportsInspectionFailures(t *testing.T) {
	for _, mode := range []string{"human", "agent", "json"} {
		for _, conflict := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/conflict=%t", mode, conflict), func(t *testing.T) {
				t.Setenv("AGENT", "0")
				if mode == "agent" {
					t.Setenv("AGENT", "1")
				}
				p := newE2EProject(t, tsTools{
					"a-broken": `install().bin("broken")`,
					"z-good":   `install().bin("healthy")`,
				})
				broken := filepath.Join(p.TargetDir, "broken")
				if err := os.Symlink(broken, broken); err != nil {
					t.Fatal(err)
				}
				if conflict {
					if err := os.WriteFile(filepath.Join(p.TargetDir, "healthy"), []byte("user owned binary"), 0755); err != nil {
						t.Fatal(err)
					}
				}
				args := []string{"shell", "audit"}
				if mode == "json" {
					args = append(args, "--json")
				}
				out, err := p.run(args...)
				if err == nil {
					t.Fatalf("audit succeeded despite an uninspectable file\n%s", out.Combined)
				}
				mustContain(t, "stderr", out.Stderr, "[a-broken]", "broken")
				mustNotContain(t, "stdout", out.Stdout, "No conflicts detected", "OK: no conflicts")
				if conflict {
					mustContain(t, "stdout", out.Stdout, "z-good", "healthy")
				}
				if mode == "json" {
					var report struct {
						HasConflicts bool           `json:"hasConflicts"`
						Conflicts    []ConflictItem `json:"conflicts"`
					}
					if err := json.Unmarshal([]byte(out.Stdout), &report); err != nil {
						t.Fatalf("invalid JSON report: %v\n%s", err, out.Stdout)
					}
					if report.HasConflicts != conflict {
						t.Errorf("hasConflicts = %t, want %t", report.HasConflicts, conflict)
					}
				}
			})
		}
	}
}

func TestShellAuditDryRunReadsHostShim(t *testing.T) {
	p := newE2EProject(t, tsTools{"example": `install().bin("example")`})
	if out, err := p.run("generate"); err != nil {
		t.Fatalf("generating host shim: %v\n%s", err, out.Combined)
	}
	out, err := p.run("--dry-run", "shell", "audit", "--json")
	if err != nil {
		t.Fatalf("auditing existing host shim: %v\n%s", err, out.Combined)
	}
	var report struct {
		HasConflicts bool `json:"hasConflicts"`
	}
	if err := json.Unmarshal([]byte(out.Stdout), &report); err != nil {
		t.Fatal(err)
	}
	if report.HasConflicts {
		t.Fatalf("generated host shim reported as a conflict: %s", out.Stdout)
	}
}
