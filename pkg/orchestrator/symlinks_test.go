package orchestrator

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestrator_SymlinkModeEnforcementRetainsSourceFile(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)
	orch.SetSymlinkFS(fsys)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/.dotfiles",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/.dotfiles/tools/ssh", 0755)
	_ = fsys.MkdirAll("/home/user/.ssh", 0755)
	_ = fsys.MkdirAll("/home/user/.generated/usage", 0755)

	sourcePath := "/home/user/.dotfiles/tools/ssh/key_file"
	writeMemFile(t, fsys, sourcePath, "secret-key-content")
	// Verify initial mode is 0644
	info, err := fsys.Lstat(sourcePath)
	if err != nil {
		t.Fatalf("stat source file: %v", err)
	}
	if info.Mode().Perm() != 0644 {
		t.Fatalf("initial mode: got %o, want 0644", info.Mode().Perm())
	}

	tool := &config.ToolConfig{
		Name:           "ssh",
		ConfigFilePath: "/home/user/.dotfiles/tools/ssh/ssh.tool.ts",
		Symlinks: []config.SymlinkConfig{
			{Source: "key_file", Target: "~/.ssh/key_file", Mode: "0600"},
		},
	}

	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("initial GenerateTools failed: %v", err)
	}

	// 1. Source file must still exist!
	exists, err := fsys.Exists(sourcePath)
	if err != nil {
		t.Fatalf("checking source file exists: %v", err)
	}
	if !exists {
		t.Fatalf("source file %s was deleted by initial GenerateTools!", sourcePath)
	}

	// Calling CleanupStaleSymlinks must NOT delete the repository source file
	if err := orch.CleanupStaleSymlinks(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleSymlinks failed: %v", err)
	}
	exists, err = fsys.Exists(sourcePath)
	if err != nil {
		t.Fatalf("checking source file exists after CleanupStaleSymlinks: %v", err)
	}
	if !exists {
		t.Fatalf("source file %s was deleted by CleanupStaleSymlinks!", sourcePath)
	}

	// 2. Source file mode must be updated to 0600
	info, err = fsys.Lstat(sourcePath)
	if err != nil {
		t.Fatalf("stat source file after generate: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("source file mode: got %o, want 0600", info.Mode().Perm())
	}

	// 3. Symlink target must exist
	targetPath := "/home/user/.ssh/key_file"
	exists, err = fsys.Exists(targetPath)
	if err != nil {
		t.Fatalf("checking target symlink exists: %v", err)
	}
	if !exists {
		t.Fatalf("target symlink %s does not exist", targetPath)
	}

	// 4. Repeated generation must also succeed and retain the source file
	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("second GenerateTools failed: %v", err)
	}
	if exists, _ := fsys.Exists(sourcePath); !exists {
		t.Fatalf("source file %s was deleted on second GenerateTools!", sourcePath)
	}
}

// Symlink targets already holding a regular file or directory are moved aside to a
// backup before the link is created, instead of being deleted. An older backup is
// kept and the displaced content goes beside it, and a repeated run leaves the
// backup alone because the link is already correct.
func TestSymlinkTargetIsBackedUpNotDeleted(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		pipeline   string
		existing   map[string]string
		runs       int
		wantBackup map[string]string
	}{
		{
			name:       "a regular file at the target is kept as .bak",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
		{
			name:       "an older backup is kept and the displaced file goes beside it",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user", "config.yml.bak": "older"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "older", "config.yml.bak.2": "user"},
		},
		{
			name:       "a directory at the target is kept whole",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml/inner.yml": "inside"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak/inner.yml": "inside"},
		},
		{
			name:       "a repeated generate leaves the backup alone",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user"},
			runs:       2,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
		{
			name:       "the install pipeline backs up too",
			pipeline:   "install",
			existing:   map[string]string{"config.yml": "user"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			root := t.TempDir()
			home := filepath.Join(root, "home")
			toolDir := filepath.Join(root, "tools", "link-tool")
			targetDir := filepath.Join(home, ".config", "link-tool")
			source := filepath.Join(toolDir, "config.yml")
			target := filepath.Join(targetDir, "config.yml")

			osFS := fs.NewResolvedFS(fs.NewOSFS(), home)
			orch := newTestOrchestrator(t, osFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-link"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}
			writeMemFile(t, osFS, source, "managed")
			for rel, content := range tt.existing {
				writeMemFile(t, osFS, filepath.Join(targetDir, rel), content)
			}

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      home,
					TargetDir:    filepath.Join(root, ".generated", "user-bin"),
					BinariesDir:  filepath.Join(root, ".generated", "binaries"),
					GeneratedDir: filepath.Join(root, ".generated"),
				},
			}
			tool := &config.ToolConfig{
				Name:           "link-tool",
				ConfigFilePath: filepath.Join(toolDir, "link-tool.tool.ts"),
				Symlinks:       []config.SymlinkConfig{{Source: "./config.yml", Target: "~/.config/link-tool/config.yml"}},
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-link"
			}

			for run := 1; run <= tt.runs; run++ {
				var err error
				if tt.pipeline == "install" {
					err = orch.InstallTool(ctx, tool, projCfg)
				} else {
					err = orch.GenerateTool(ctx, tool, projCfg)
				}
				if err != nil {
					t.Fatalf("%s run %d: %v", tt.pipeline, run, err)
				}
			}

			info, err := os.Lstat(target)
			if err != nil || info.Mode()&os.ModeSymlink == 0 {
				t.Fatalf("expected a symlink at %s, got %v, %v", target, info, err)
			}
			if linkTarget, _ := os.Readlink(target); linkTarget != source {
				t.Errorf("symlink points at %q, want %q", linkTarget, source)
			}
			for rel, want := range tt.wantBackup {
				got, err := os.ReadFile(filepath.Join(targetDir, rel))
				if err != nil {
					t.Fatalf("backup %s is missing: %v", rel, err)
				}
				if string(got) != want {
					t.Errorf("backup %s = %q, want %q", rel, string(got), want)
				}
			}
		})
	}
}
