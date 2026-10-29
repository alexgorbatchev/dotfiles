package orchestrator

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
)

// A tool initialization can put its own directories in front of PATH, as `brew shellenv` does with
// /opt/homebrew/bin. The shims must still come first, or a binary there shadows the tool the shim runs.
func TestGenerateShellScripts_ShimsStayFirstAfterToolInitializations(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	const shimDir = "/home/user/.generated/user-bin"
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       shimDir,
		},
	}
	const prepend = `export PATH="/home/user/brew/bin:$PATH"`
	shellConfig := func() *config.ShellTypeConfig {
		return &config.ShellTypeConfig{Scripts: []config.ShellScript{{Kind: "always", Value: prepend}}}
	}
	tools := []*config.ToolConfig{{
		Name:           "brew",
		ConfigFilePath: "/home/user/tools/brew.tool.ts",
		ShellConfigs:   &config.ShellConfigs{Zsh: shellConfig(), Bash: shellConfig()},
	}}

	if err := orch.generateShellScripts(ctx, tools, projCfg); err != nil {
		t.Fatalf("generateShellScripts: %v", err)
	}

	shimPlacement := `__dotfiles_dir="` + shimDir + `"`
	for _, sh := range []string{"zsh", "bash"} {
		data, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main." + sh)
		if err != nil {
			t.Fatalf("reading main.%s: %v", sh, err)
		}
		text := string(data)
		toolIdx := strings.Index(text, prepend)
		lastShimIdx := strings.LastIndex(text, shimPlacement)
		if toolIdx < 0 || lastShimIdx < toolIdx {
			t.Errorf("main.%s places the shims before the tool's PATH change, so the tool's directory wins:\n%s", sh, text)
		}
	}
}

// pathModificationsSection returns the PATH Modifications section of a generated script, up to the next section.
func pathModificationsSection(script string) string {
	start := strings.Index(script, shellinit.GenerateSectionHeader("PATH Modifications"))
	if start < 0 {
		return ""
	}
	rest := script[start+1:]
	if end := strings.Index(rest, "\n# ====="); end >= 0 {
		return rest[:end]
	}
	return rest
}
