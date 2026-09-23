package drift

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestInspector_Comprehensive(t *testing.T) {
	ctx := context.Background()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"

	// Setup files
	_ = mem.MkdirAll("/home/user/.ssh", 0755)
	_ = mem.MkdirAll("/home/user/.config/app", 0755)
	_ = mem.MkdirAll("/repo/tools/tool", 0755)

	symSource := "/repo/tools/tool/config"
	symTarget := "/home/user/.config/app/config"
	_ = mem.WriteFile(symSource, []byte("sym content"), 0644)
	_ = mem.Symlink(symSource, symTarget)

	tmplSource := "/repo/tools/tool/tmpl"
	tmplTarget := "/home/user/.config/app/tmpl"
	_ = mem.WriteFile(tmplSource, []byte("email = {email}\n"), 0644)
	_ = mem.WriteFile(tmplTarget, []byte("email = custom@example.com\n"), 0644)

	blockTarget := "/home/user/.ssh/config"
	_ = mem.WriteFile(blockTarget, []byte("# >>> dotfiles:includes (managed by dotfiles - do not edit inside block)\nInclude a\n# <<< dotfiles:includes\n"), 0600)

	tool := &config.ToolConfig{
		Name:           "tool",
		ConfigFilePath: "/repo/tools/tool/tool.tool.ts",
		Symlinks: []config.SymlinkConfig{
			{
				Source: "./config",
				Target: "~/.config/app/config",
			},
		},
		Templates: []config.TemplateConfig{
			{
				Source:    "./tmpl",
				Target:    "~/.config/app/tmpl",
				Variables: map[string]any{"email": "alex@example.com"},
			},
		},
		Blocks: []config.BlockConfig{
			{
				Target:  "~/.ssh/config",
				ID:      "includes",
				Content: "Include a\nInclude b",
			},
		},
	}

	ins := NewInspector(mem, reg, projCfg)
	items, err := ins.InspectTool(ctx, tool)
	if err != nil {
		t.Fatalf("InspectTool failed: %v", err)
	}

	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(items))
	}

	// Symlink was created directly and matches desired, so in-sync
	if items[0].Type != "symlink" || items[0].State != StateInSync {
		t.Errorf("symlink item: %+v", items[0])
	}

	// Template on disk differs from rendered template and has no base hash -> unmanaged
	if items[1].Type != "template" || items[1].State != StateUnmanaged {
		t.Errorf("template item: %+v", items[1])
	}
	if items[1].Diff == "" {
		t.Errorf("expected diff for template item")
	}

	// Block differs from desired -> unmanaged
	if items[2].Type != "block" || items[2].State != StateUnmanaged {
		t.Errorf("block item: %+v", items[2])
	}

	// InspectAll
	disabledTool := &config.ToolConfig{Name: "disabled", Disabled: true}
	allItems, err := ins.InspectAll(ctx, []*config.ToolConfig{tool, disabledTool})
	if err != nil {
		t.Fatalf("InspectAll failed: %v", err)
	}
	if len(allItems) != 3 {
		t.Errorf("expected 3 items from InspectAll, got %d", len(allItems))
	}
}

func TestInspector_SymlinkStates(t *testing.T) {
	ctx := context.Background()
	database, _ := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	defer database.Close()
	reg := registry.NewRegistry(database)
	mem := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	_ = mem.MkdirAll("/home/user", 0755)

	target := "/home/user/link"
	tool := &config.ToolConfig{
		Name: "test",
		Symlinks: []config.SymlinkConfig{
			{Source: "/repo/src", Target: target},
		},
	}

	ins := NewInspector(mem, reg, projCfg)

	// Case 1: Target does not exist, base does not exist -> StateNew
	items, _ := ins.InspectTool(ctx, tool)
	if items[0].State != StateNew {
		t.Errorf("expected StateNew, got %s", items[0].State)
	}

	// Record in registry
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		targetPath := "/repo/src-old"
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "test",
			OperationType: "symlink",
			FilePath:      target,
			TargetPath:    &targetPath,
			FileType:      "symlink",
			CreatedAt:     100,
			OperationID:   "op1",
		})
	})

	// Case 2: Target does not exist, base exists -> StateMissing
	items, _ = ins.InspectTool(ctx, tool)
	if items[0].State != StateMissing {
		t.Errorf("expected StateMissing, got %s", items[0].State)
	}

	// Create symlink pointing to /repo/src-old (current == base, desired != base) -> StateUpstreamUpdate
	_ = mem.Symlink("/repo/src-old", target)
	items, _ = ins.InspectTool(ctx, tool)
	if items[0].State != StateUpstreamUpdate {
		t.Errorf("expected StateUpstreamUpdate, got %s", items[0].State)
	}

	// Point symlink to /repo/src-custom (current != base, desired == base) -> StateLocalDrift
	_ = mem.Remove(target)
	_ = mem.Symlink("/repo/src-custom", target)
	tool.Symlinks[0].Source = "/repo/src-old" // desired == base
	items, _ = ins.InspectTool(ctx, tool)
	if items[0].State != StateLocalDrift {
		t.Errorf("expected StateLocalDrift, got %s", items[0].State)
	}

	// Conflict: current != base && desired != base
	tool.Symlinks[0].Source = "/repo/src-new"
	items, _ = ins.InspectTool(ctx, tool)
	if items[0].State != StateConflict {
		t.Errorf("expected StateConflict, got %s", items[0].State)
	}
}

func TestInspector_CopyStates(t *testing.T) {
	ctx := context.Background()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	_ = mem.MkdirAll("/home/user/.config/app", 0755)
	_ = mem.MkdirAll("/repo/tools/tool", 0755)

	srcPath := "/repo/tools/tool/config.toml"
	targetPath := "/home/user/.config/app/config.toml"

	_ = mem.WriteFile(srcPath, []byte("theme = default\n"), 0644)

	tool := &config.ToolConfig{
		Name:           "tool",
		ConfigFilePath: "/repo/tools/tool/tool.tool.ts",
		Copies: []config.CopyConfig{
			{
				Source: "./config.toml",
				Target: "~/.config/app/config.toml",
			},
		},
	}

	ins := NewInspector(mem, reg, projCfg)

	t.Run("StateNew when target does not exist and no base recorded", func(t *testing.T) {
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(items))
		}
		item := items[0]
		if item.Type != "copy" {
			t.Errorf("expected Type 'copy', got %q", item.Type)
		}
		if item.State != StateNew {
			t.Errorf("expected StateNew, got %q", item.State)
		}
		if item.Diff == "" {
			t.Error("expected non-empty diff for StateNew")
		}
	})

	t.Run("StateInSync when target exists matching desired without base", func(t *testing.T) {
		_ = mem.WriteFile(targetPath, []byte("theme = default\n"), 0644)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateInSync {
			t.Errorf("expected StateInSync, got %+v", items)
		}
	})

	t.Run("StateUnmanaged when target exists differing from desired without base", func(t *testing.T) {
		_ = mem.WriteFile(targetPath, []byte("theme = custom\n"), 0644)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateUnmanaged {
			t.Errorf("expected StateUnmanaged, got %+v", items)
		}
	})

	// Record base state in registry (base content: "theme = default\n")
	baseHash := fs.HashContent([]byte("theme = default\n"))
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "tool",
			OperationType: "copy",
			FilePath:      targetPath,
			ContentHash:   &baseHash,
			FileType:      "file",
			CreatedAt:     100,
			OperationID:   "op_copy_1",
		})
	})

	t.Run("StateMissing when recorded target is removed from disk", func(t *testing.T) {
		_ = mem.Remove(targetPath)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateMissing {
			t.Errorf("expected StateMissing, got %+v", items)
		}
	})

	t.Run("StateUpstreamUpdate when disk matches base but source updated", func(t *testing.T) {
		_ = mem.WriteFile(targetPath, []byte("theme = default\n"), 0644)
		_ = mem.WriteFile(srcPath, []byte("theme = v2\n"), 0644)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateUpstreamUpdate {
			t.Errorf("expected StateUpstreamUpdate, got %+v", items)
		}
	})

	t.Run("StateLocalDrift when source matches base but disk modified", func(t *testing.T) {
		_ = mem.WriteFile(srcPath, []byte("theme = default\n"), 0644)
		_ = mem.WriteFile(targetPath, []byte("theme = user-edit\n"), 0644)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateLocalDrift {
			t.Errorf("expected StateLocalDrift, got %+v", items)
		}
	})

	t.Run("StateConflict when both disk and source modified from base", func(t *testing.T) {
		_ = mem.WriteFile(srcPath, []byte("theme = v2\n"), 0644)
		_ = mem.WriteFile(targetPath, []byte("theme = user-edit\n"), 0644)
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			t.Fatalf("InspectTool failed: %v", err)
		}
		if len(items) != 1 || items[0].State != StateConflict {
			t.Errorf("expected StateConflict, got %+v", items)
		}
	})
}

func TestInspector_SymlinkCanonicalTargetMatching(t *testing.T) {
	ctx := context.Background()
	database, _ := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	defer database.Close()
	reg := registry.NewRegistry(database)
	mem := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	_ = mem.MkdirAll("/home/user", 0755)

	tests := []struct {
		name       string
		diskTarget string
		toolSource string
		wantState  State
	}{
		{
			name:       "macOS /private/var alias matches /var",
			diskTarget: "/private/var/folders/xyz/tool/config",
			toolSource: "/var/folders/xyz/tool/config",
			wantState:  StateInSync,
		},
		{
			name:       "macOS /private/tmp alias matches /tmp",
			diskTarget: "/private/tmp/tool/config",
			toolSource: "/tmp/tool/config",
			wantState:  StateInSync,
		},
		{
			name:       "macOS /tmp on disk matches /private/tmp desired",
			diskTarget: "/tmp/tool/config",
			toolSource: "/private/tmp/tool/config",
			wantState:  StateInSync,
		},
		{
			name:       "macOS /private/etc alias matches /etc",
			diskTarget: "/private/etc/hosts.custom",
			toolSource: "/etc/hosts.custom",
			wantState:  StateInSync,
		},
		{
			name:       "Cleaned path with relative components matches",
			diskTarget: "/home/user/app/../app/config",
			toolSource: "/home/user/app/config",
			wantState:  StateInSync,
		},
		{
			name:       "Non-matching symlink returns drift",
			diskTarget: "/other/path/config",
			toolSource: "/var/folders/xyz/tool/config",
			wantState:  StateUnmanaged,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			symLinkTarget := "/home/user/symlink"
			_ = mem.Remove(symLinkTarget)
			_ = mem.Symlink(tt.diskTarget, symLinkTarget)

			tool := &config.ToolConfig{
				Name: "test-symlink",
				Symlinks: []config.SymlinkConfig{
					{Source: tt.toolSource, Target: symLinkTarget},
				},
			}

			ins := NewInspector(mem, reg, projCfg)
			items, err := ins.InspectTool(ctx, tool)
			if err != nil {
				t.Fatalf("InspectTool failed: %v", err)
			}
			if len(items) != 1 {
				t.Fatalf("expected 1 item, got %d", len(items))
			}
			if items[0].State != tt.wantState {
				t.Errorf("got state %q, want %q (diff: %s)", items[0].State, tt.wantState, items[0].Diff)
			}
		})
	}
}

func TestUnifiedDiff_Binary(t *testing.T) {
	binary1 := "\x00\x01\x02"
	binary2 := "\x00\x01\x03"
	diff := UnifiedDiff("a.bin", "b.bin", binary1, binary2)
	if diff == "" || diff[:12] != "Binary files" {
		t.Errorf("expected binary files diff message, got: %q", diff)
	}
}

// A directory copy is reported file by file, the way generate settles it, and a
// target a copy cannot treat as its own file or directory is reported as unmanaged.
func TestInspector_CopyMembersAndForeignTargets(t *testing.T) {
	ctx := context.Background()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)

	write := func(t *testing.T, mem fs.FS, path, content string) {
		t.Helper()
		if err := mem.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := mem.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	newTool := func(source, target string) *config.ToolConfig {
		return &config.ToolConfig{
			Name:           "tool",
			ConfigFilePath: "/repo/tools/tool/tool.tool.ts",
			Copies:         []config.CopyConfig{{Source: source, Target: target}},
		}
	}
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"

	t.Run("a directory copy yields one item per member", func(t *testing.T) {
		mem := fs.NewMemFS()
		write(t, mem, "/repo/tools/tool/themes/b.toml", "b")
		write(t, mem, "/repo/tools/tool/themes/nested/a.toml", "a")
		write(t, mem, "/home/user/themes/b.toml", "b")

		items, err := NewInspector(mem, reg, projCfg).InspectTool(ctx, newTool("./themes", "~/themes"))
		if err != nil {
			t.Fatalf("InspectTool: %v", err)
		}
		states := map[string]State{}
		for _, item := range items {
			states[item.FilePath] = item.State
		}
		want := map[string]State{
			"/home/user/themes/b.toml":        StateInSync,
			"/home/user/themes/nested/a.toml": StateNew,
		}
		if len(states) != len(want) {
			t.Fatalf("items = %+v, want one per member", items)
		}
		for path, state := range want {
			if states[path] != state {
				t.Errorf("%s = %q, want %q", path, states[path], state)
			}
		}
	})

	t.Run("a symlink at a file copy's target is unmanaged", func(t *testing.T) {
		mem := fs.NewMemFS()
		write(t, mem, "/repo/tools/tool/config.toml", "same")
		if err := mem.MkdirAll("/home/user", 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		// The link names the source itself, so reading through it would look in sync.
		if err := mem.Symlink("/repo/tools/tool/config.toml", "/home/user/config.toml"); err != nil {
			t.Fatalf("symlink: %v", err)
		}

		items, err := NewInspector(mem, reg, projCfg).InspectTool(ctx, newTool("./config.toml", "~/config.toml"))
		if err != nil {
			t.Fatalf("InspectTool: %v", err)
		}
		if len(items) != 1 || items[0].State != StateUnmanaged || items[0].Diff == "" {
			t.Errorf("items = %+v, want one unmanaged copy with an explanation", items)
		}
	})

	t.Run("a file where a directory copy belongs is unmanaged", func(t *testing.T) {
		mem := fs.NewMemFS()
		write(t, mem, "/repo/tools/tool/themes/a.toml", "a")
		write(t, mem, "/home/user/themes", "not a directory")

		items, err := NewInspector(mem, reg, projCfg).InspectTool(ctx, newTool("./themes", "~/themes"))
		if err != nil {
			t.Fatalf("InspectTool: %v", err)
		}
		if len(items) != 1 || items[0].FilePath != "/home/user/themes" || items[0].State != StateUnmanaged {
			t.Errorf("items = %+v, want the target itself reported as unmanaged", items)
		}
	})
}

func TestCopyMembers(t *testing.T) {
	mem := fs.NewMemFS()
	for _, path := range []string{"/src/z.txt", "/src/a/b.txt", "/src/a/a.txt"} {
		if err := mem.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := mem.WriteFile(path, []byte("x"), 0644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}

	members, err := CopyMembers(mem, "/src", "/dst")
	if err != nil {
		t.Fatalf("CopyMembers: %v", err)
	}
	want := []CopyMember{
		{Source: "/src", Target: "/dst", Dir: true},
		{Source: "/src/a", Target: "/dst/a", Dir: true},
		{Source: "/src/a/a.txt", Target: "/dst/a/a.txt"},
		{Source: "/src/a/b.txt", Target: "/dst/a/b.txt"},
		{Source: "/src/z.txt", Target: "/dst/z.txt"},
	}
	if !slices.Equal(members, want) {
		t.Errorf("members = %+v, want %+v", members, want)
	}

	single, err := CopyMembers(mem, "/src/z.txt", "/dst/z.txt")
	if err != nil || !slices.Equal(single, []CopyMember{{Source: "/src/z.txt", Target: "/dst/z.txt"}}) {
		t.Errorf("single-file members = %+v, %v", single, err)
	}

	if _, err := CopyMembers(mem, "/absent", "/dst"); err == nil {
		t.Error("expected an error for a missing source")
	}
}
