package orchestrator

import (
	"bytes"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestDetectConflicts_AliasShadowsBinary(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:           "flutter",
			ConfigFilePath: "/home/user/dotfiles/tools/flutter.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"fd": "flutter doctor",
					},
				},
			},
		},
		{
			Name:           "fd",
			ConfigFilePath: "/home/user/dotfiles/tools/fd.tool.ts",
			Binaries: []interface{}{
				map[string]interface{}{"name": "fd"},
			},
		},
	}

	conflicts := DetectConflicts(tools, "/home/user/dotfiles")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}

	c := conflicts[0]
	if c.Kind != ConflictAliasShadowsBinary {
		t.Errorf("expected kind %q, got %q", ConflictAliasShadowsBinary, c.Kind)
	}
	if c.ToolName != "flutter" || c.Name != "fd" || c.OtherTool != "fd" {
		t.Errorf("unexpected conflict fields: %+v", c)
	}
	wantMsg := `alias "fd" ('flutter doctor') shadows binary "fd" from tools/fd.tool.ts`
	if c.Message != wantMsg {
		t.Errorf("got message %q, want %q", c.Message, wantMsg)
	}
}

func TestDetectConflicts_FunctionShadowsBinary(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:           "custom-bat",
			ConfigFilePath: "/home/user/dotfiles/tools/custom-bat.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Bash: &config.ShellTypeConfig{
					Functions: map[string]string{
						"bat": "echo bat wrapper",
					},
				},
			},
		},
		{
			Name:           "bat",
			ConfigFilePath: "/home/user/dotfiles/tools/bat.tool.ts",
			Binaries: []interface{}{
				map[string]interface{}{"name": "bat"},
			},
		},
	}

	conflicts := DetectConflicts(tools, "/home/user/dotfiles")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}

	c := conflicts[0]
	if c.Kind != ConflictFunctionShadowsBinary {
		t.Errorf("expected kind %q, got %q", ConflictFunctionShadowsBinary, c.Kind)
	}
	if c.ToolName != "custom-bat" || c.Name != "bat" || c.OtherTool != "bat" {
		t.Errorf("unexpected conflict fields: %+v", c)
	}
	wantMsg := `function "bat" shadows binary "bat" from tools/bat.tool.ts`
	if c.Message != wantMsg {
		t.Errorf("got message %q, want %q", c.Message, wantMsg)
	}
}

func TestDetectConflicts_AliasCollision(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:           "tool1",
			ConfigFilePath: "/home/user/dotfiles/tools/tool1.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"ll": "ls -la",
					},
				},
			},
		},
		{
			Name:           "tool2",
			ConfigFilePath: "/home/user/dotfiles/tools/tool2.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"ll": "eza -la",
					},
				},
			},
		},
	}

	conflicts := DetectConflicts(tools, "/home/user/dotfiles")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}

	c := conflicts[0]
	if c.Kind != ConflictAliasCollision {
		t.Errorf("expected kind %q, got %q", ConflictAliasCollision, c.Kind)
	}
	wantMsg := `alias "ll" ('ls -la') collides with alias from tools/tool2.tool.ts`
	if c.Message != wantMsg {
		t.Errorf("got message %q, want %q", c.Message, wantMsg)
	}
}

func TestDetectConflicts_FunctionCollision(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:           "tool1",
			ConfigFilePath: "/home/user/dotfiles/tools/tool1.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Powershell: &config.ShellTypeConfig{
					Functions: map[string]string{
						"myfn": "Write-Host 1",
					},
				},
			},
		},
		{
			Name:           "tool2",
			ConfigFilePath: "/home/user/dotfiles/tools/tool2.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Powershell: &config.ShellTypeConfig{
					Functions: map[string]string{
						"myfn": "Write-Host 2",
					},
				},
			},
		},
	}

	conflicts := DetectConflicts(tools, "/home/user/dotfiles")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}

	c := conflicts[0]
	if c.Kind != ConflictFunctionCollision {
		t.Errorf("expected kind %q, got %q", ConflictFunctionCollision, c.Kind)
	}
	wantMsg := `function "myfn" collides with function from tools/tool2.tool.ts`
	if c.Message != wantMsg {
		t.Errorf("got message %q, want %q", c.Message, wantMsg)
	}
}

func TestDetectConflicts_BinaryCollision(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:           "tool1",
			ConfigFilePath: "/home/user/dotfiles/tools/tool1.tool.ts",
			Binaries: []interface{}{
				map[string]interface{}{"name": "shared-bin"},
			},
		},
		{
			Name:           "tool2",
			ConfigFilePath: "/home/user/dotfiles/tools/tool2.tool.ts",
			Binaries: []interface{}{
				config.BinaryConfig{Name: "shared-bin"},
			},
		},
	}

	conflicts := DetectConflicts(tools, "/home/user/dotfiles")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}

	c := conflicts[0]
	if c.Kind != ConflictBinaryCollision {
		t.Errorf("expected kind %q, got %q", ConflictBinaryCollision, c.Kind)
	}
	wantMsg := `binary "shared-bin" collides with binary from tools/tool2.tool.ts`
	if c.Message != wantMsg {
		t.Errorf("got message %q, want %q", c.Message, wantMsg)
	}
}

func TestDetectConflicts_DisabledAndHostnameFiltering(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name:     "disabled-tool",
			Disabled: true,
			Binaries: []interface{}{
				map[string]interface{}{"name": "fd"},
			},
		},
		{
			Name:     "wrong-host-tool",
			Hostname: "non-existent-hostname-xyz-999",
			Binaries: []interface{}{
				map[string]interface{}{"name": "fd"},
			},
		},
		{
			Name: "flutter",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"fd": "flutter doctor",
					},
				},
			},
		},
	}

	conflicts := DetectConflicts(tools)
	if len(conflicts) != 0 {
		t.Fatalf("expected 0 conflicts when other tools are disabled or host-mismatched, got %d: %+v", len(conflicts), conflicts)
	}
}

func TestDetectConflicts_SameToolNoSelfConflict(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name: "mytool",
			Binaries: []interface{}{
				map[string]interface{}{"name": "mytool"},
			},
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"mytool": "mytool --extra",
					},
					Functions: map[string]string{
						"mytool": "echo mytool",
					},
				},
			},
		},
	}

	conflicts := DetectConflicts(tools)
	if len(conflicts) != 0 {
		t.Fatalf("expected 0 conflicts for self alias/function/binary, got %d: %+v", len(conflicts), conflicts)
	}
}

func TestDetectConflicts_FallbackToolOrigin(t *testing.T) {
	tools := []*config.ToolConfig{
		{
			Name: "tool1",
			Binaries: []interface{}{
				map[string]interface{}{"name": "dup"},
			},
		},
		{
			Name: "tool2",
			Binaries: []interface{}{
				map[string]interface{}{"name": "dup"},
			},
		},
	}

	conflicts := DetectConflicts(tools)
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d", len(conflicts))
	}
	wantMsg := `binary "dup" collides with binary from tool2`
	if conflicts[0].Message != wantMsg {
		t.Errorf("got %q, want %q", conflicts[0].Message, wantMsg)
	}
}

func TestWarnConflicts(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test",
		Level:  logger.LogLevelDefault,
		Writer: &buf,
	})

	orch := &Orchestrator{
		logger: log,
	}

	tools := []*config.ToolConfig{
		{
			Name:           "flutter",
			ConfigFilePath: "/dotfiles/tools/flutter.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"fd": "flutter doctor",
					},
				},
			},
		},
		{
			Name:           "fd",
			ConfigFilePath: "/dotfiles/tools/fd.tool.ts",
			Binaries: []interface{}{
				map[string]interface{}{"name": "fd"},
			},
		},
	}

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir: "/dotfiles",
		},
	}

	orch.WarnConflicts(tools, projCfg)

	output := buf.String()
	if !strings.Contains(output, "WARN\t[flutter] alias \"fd\" ('flutter doctor') shadows binary \"fd\" from tools/fd.tool.ts") {
		t.Errorf("expected warning in log output, got:\n%s", output)
	}

	buf.Reset()
	orch.WarnConflicts(tools, nil)
	outputNil := buf.String()
	if !strings.Contains(outputNil, "WARN\t[flutter] alias \"fd\" ('flutter doctor') shadows binary \"fd\" from /dotfiles/tools/fd.tool.ts") {
		t.Errorf("expected warning with full path when projCfg is nil, got:\n%s", outputNil)
	}
}
