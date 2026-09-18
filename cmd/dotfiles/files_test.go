package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestBuildDirTreeAndFormatTree(t *testing.T) {
	memFS := fs.NewMemFS()

	dirPath := "/workspace/tool"
	_ = memFS.MkdirAll(filepath.Join(dirPath, "b_dir", "sub"), 0755)
	_ = memFS.WriteFile(filepath.Join(dirPath, "a_file.txt"), []byte("a"), 0644)
	_ = memFS.WriteFile(filepath.Join(dirPath, "b_dir", "sub", "c_file.txt"), []byte("c"), 0644)

	nodes, err := buildDirTree(memFS, dirPath)
	if err != nil {
		t.Fatalf("buildDirTree failed: %v", err)
	}
	if len(nodes) != 2 {
		t.Fatalf("expected 2 top-level nodes, got %d", len(nodes))
	}

	treeStr := cliout.FormatTree(nodes)
	if !strings.Contains(treeStr, "b_dir") || !strings.Contains(treeStr, "a_file.txt") {
		t.Errorf("FormatTree output missing expected nodes, got:\n%s", treeStr)
	}

	// buildDirTree on non-existent path
	_, err = buildDirTree(memFS, "/nonexistent/path")
	if err == nil {
		t.Error("expected error building dir tree for non-existent path")
	}
}

func TestFilesCmd(t *testing.T) {
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	cfgContent := `export default { paths: { generatedDir: "./.generated" } };`
	_ = os.WriteFile(cfgPath, []byte(cfgContent), 0644)

	oldCfg := cfgFile
	cfgFile = cfgPath
	defer func() { cfgFile = oldCfg }()

	rootCmd.SetArgs([]string{"files"})
	_ = rootCmd.Execute()
}

func TestFilesCommand_InstalledTool(t *testing.T) {
	p := newE2EProject(t, `
		"bat": {"name": "bat", "installationMethod": "manual"},
		"empty": {"name": "empty", "installationMethod": "manual"},
		"gone": {"name": "gone", "installationMethod": "manual"}
	`)
	installRoot := filepath.Join(p.Root, "installed")
	batPath := filepath.Join(installRoot, "bat")
	if err := os.MkdirAll(filepath.Join(batPath, "sub"), 0755); err != nil {
		t.Fatalf("creating install dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(batPath, "sub", "bat"), []byte("bin"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}
	if err := os.WriteFile(filepath.Join(batPath, "LICENSE"), []byte("MIT"), 0644); err != nil {
		t.Fatalf("writing license: %v", err)
	}
	emptyPath := filepath.Join(installRoot, "empty")
	if err := os.MkdirAll(emptyPath, 0755); err != nil {
		t.Fatalf("creating empty dir: %v", err)
	}
	gonePath := filepath.Join(installRoot, "gone")
	p.seedInstallation(t, "bat", "v1.0.0", batPath)
	p.seedInstallation(t, "empty", "v1.0.0", emptyPath)
	p.seedInstallation(t, "gone", "v1.0.0", gonePath)

	t.Run("tree in human mode", func(t *testing.T) {
		out, err := p.run("files", "bat")
		if err != nil {
			t.Fatalf("files bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, batPath+"\n", "sub", "bat", "LICENSE")
	})

	t.Run("tree as json", func(t *testing.T) {
		out, err := p.run("files", "bat", "--json")
		if err != nil {
			t.Fatalf("files bat --json: %v\n%s", err, out.Combined)
		}
		var got struct {
			Tool        string            `json:"tool"`
			InstallPath string            `json:"installPath"`
			Files       []cliout.TreeNode `json:"files"`
		}
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not the expected JSON object: %v\n%s", err, out.Stdout)
		}
		if got.Tool != "bat" || got.InstallPath != batPath {
			t.Fatalf("json = %+v, want tool bat at %s", got, batPath)
		}
		var names []string
		for _, n := range got.Files {
			names = append(names, n.Name)
		}
		if !slices.Contains(names, "sub") || !slices.Contains(names, "LICENSE") {
			t.Fatalf("top-level files = %v, want sub and LICENSE", names)
		}
	})

	t.Run("empty install dir", func(t *testing.T) {
		out, err := p.run("files", "empty")
		if err != nil {
			t.Fatalf("files empty: %v\n%s", err, out.Combined)
		}
		if out.Stdout != emptyPath+"\n(empty directory)\n" {
			t.Fatalf("stdout = %q, want the empty-directory report", out.Stdout)
		}

		out, err = p.run("files", "empty", "--json")
		if err != nil {
			t.Fatalf("files empty --json: %v\n%s", err, out.Combined)
		}
		var got struct {
			Files []any `json:"files"`
		}
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not the expected JSON object: %v\n%s", err, out.Stdout)
		}
		if len(got.Files) != 0 {
			t.Fatalf("files = %v, want none", got.Files)
		}
	})

	t.Run("install path missing on disk", func(t *testing.T) {
		_, err := p.run("files", "gone")
		if err == nil || !strings.Contains(err.Error(), "install path not found: "+gonePath) {
			t.Fatalf("error = %v, want missing install path failure", err)
		}
	})

	t.Run("tool not installed", func(t *testing.T) {
		_, err := p.run("files", "nope")
		if err == nil || !strings.Contains(err.Error(), "tool installation not found: nope") {
			t.Fatalf("error = %v, want not-installed failure", err)
		}
	})
}

func TestFilesCommand_ManagedFiles(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat", "installationMethod": "manual"}`)

	t.Run("nothing managed in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("files")
		if err != nil {
			t.Fatalf("files: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "no files managed\n" {
			t.Fatalf("stdout = %q, want the compact empty report", out.Stdout)
		}
	})

	managed := filepath.Join(p.TargetDir, "bat")
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "shim",
			FilePath:      managed,
			FileType:      "shim",
		})
	})

	t.Run("listing in human mode", func(t *testing.T) {
		out, err := p.run("files")
		if err != nil {
			t.Fatalf("files: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "- bat (shim): "+managed+"\n" {
			t.Fatalf("stdout = %q, want one managed file line", out.Stdout)
		}
	})

	t.Run("listing in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("files")
		if err != nil {
			t.Fatalf("files: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "tool:bat type:shim path:"+managed+"\n" {
			t.Fatalf("stdout = %q, want one compact managed file line", out.Stdout)
		}
	})

	t.Run("listing as json", func(t *testing.T) {
		out, err := p.run("files", "--json")
		if err != nil {
			t.Fatalf("files --json: %v\n%s", err, out.Combined)
		}
		var ops []map[string]any
		if err := json.Unmarshal([]byte(out.Stdout), &ops); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(ops) != 1 || ops[0]["FilePath"] != managed {
			t.Fatalf("operations = %v, want the one seeded shim at %s", ops, managed)
		}
	})
}
