package drift

import (
	"context"
	"database/sql"
	"fmt"
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

func TestUnifiedDiff_Binary(t *testing.T) {
	binary1 := "\x00\x01\x02"
	binary2 := "\x00\x01\x03"
	diff := UnifiedDiff("a.bin", "b.bin", binary1, binary2)
	if diff == "" || diff[:12] != "Binary files" {
		t.Errorf("expected binary files diff message, got: %q", diff)
	}
}
