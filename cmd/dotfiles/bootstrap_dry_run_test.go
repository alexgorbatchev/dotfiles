package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestDryRunUsesInstalledRegistryWithoutChangingIt(t *testing.T) {
	p := newE2EProject(t, tsTools{"example": `install("manual")`})
	p.seedInstallation(t, "example", "1.2.3", filepath.Join(p.Root, "installed"))
	managed := filepath.Join(p.TargetDir, "example")
	if err := os.WriteFile(managed, []byte("installed shim"), 0755); err != nil {
		t.Fatal(err)
	}
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName: "example", OperationType: "shim", FilePath: managed, FileType: "shim",
		})
	})
	path := filepath.Join(p.GeneratedDir, "registry.db")
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	out, err := p.run("--dry-run", "tool", "info", "example", "--json")
	if err != nil {
		t.Fatalf("dry-run info: %v\n%s", err, out.Combined)
	}
	var report ToolInfoReport
	if err := json.Unmarshal([]byte(out.Stdout), &report); err != nil {
		t.Fatal(err)
	}
	if !report.Installed || report.InstalledVersion != "1.2.3" {
		t.Fatalf("dry-run lost installed state: %+v", report)
	}
	if out, err := p.run("--dry-run", "tool", "uninstall", "example"); err != nil {
		t.Fatalf("dry-run uninstall: %v\n%s", err, out.Combined)
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("dry-run modified live registry: %v", err)
	}
	if rec := p.installation(t, "example"); rec == nil || rec.Version != "1.2.3" {
		t.Fatalf("dry-run removed the real installation: %+v", rec)
	}
	if content, err := os.ReadFile(managed); err != nil || string(content) != "installed shim" {
		t.Fatalf("dry-run modified the installed shim: %q (%v)", content, err)
	}
}

func TestDryRunGeneratesCopiesAndTemplatesFromExistingFiles(t *testing.T) {
	p := newE2EProject(t, tsTools{"files": `install().copy("../source.txt", "~/copy.txt").template("../template.txt", "~/template.txt")`})
	files := map[string]string{
		filepath.Join(p.Root, "source.txt"):      "source content\n",
		filepath.Join(p.Root, "template.txt"):    "template content\n",
		filepath.Join(p.HomeDir, "copy.txt"):     "existing copy\n",
		filepath.Join(p.HomeDir, "template.txt"): "existing template\n",
	}
	for path, content := range files {
		if err := os.WriteFile(path, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	// Seed the on-disk registry without generating files: dry-run must preserve it
	// along with sources and existing destinations, even with overwrite enabled.
	p.seedRegistry(t, func(context.Context, *registry.Registry, *sql.Tx) error { return nil })
	registryPath := filepath.Join(p.GeneratedDir, "registry.db")
	before, err := os.ReadFile(registryPath)
	if err != nil {
		t.Fatal(err)
	}
	out, err := p.run("--dry-run", "state", "generate", "--overwrite")
	if err != nil {
		t.Fatalf("dry-run copies/templates: %v\n%s", err, out.Combined)
	}
	for path, content := range files {
		if got, err := os.ReadFile(path); err != nil || string(got) != content {
			t.Errorf("host file %s changed: %q, %v", path, got, err)
		}
	}
	if after, err := os.ReadFile(registryPath); err != nil || !bytes.Equal(before, after) {
		t.Fatalf("dry-run modified live registry: %v", err)
	}
	entries, err := os.ReadDir(p.HomeDir)
	if err != nil || len(entries) != 2 {
		t.Fatalf("dry-run wrote files or backups: %v, %v", entries, err)
	}
}
