package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// cliCompletionFileName is the zsh completion file for the dotfiles binary itself.
// zsh's autoloader resolves a command's completion as "_<command>" on fpath.
const cliCompletionFileName = "_dotfiles"

// shellScriptsDirOf returns the directory generated shell scripts are written to,
// defaulting to <generatedDir>/shell-scripts when the configuration leaves it unset.
func shellScriptsDirOf(projCfg *config.ProjectConfig) string {
	if projCfg.Paths.ShellScriptsDir != "" {
		return projCfg.Paths.ShellScriptsDir
	}
	return filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
}

// GenerateCLICompletion writes the CLI's own zsh completion script into the
// completions directory that the generated main.zsh already adds to fpath, so
// `dotfiles <Tab>` works without any tool configuration declaring it.
//
// The file is tracked under the "system" pseudo-tool, like main.zsh, because
// stale-file cleanup only walks the tools present in the configuration: a tool
// named "dotfiles" that once declared its own completions can drop that entry
// without the cleanup ever removing this file.
//
// Cobra's script is safe to autoload from fpath. Its file-scope
// `compdef _dotfiles dotfiles` runs once when zsh first loads the function, and
// its trailing `$funcstack` guard skips the completion attempt on that load, so
// no explicit compdef or source line is needed in the generated init script.
func (o *Orchestrator) GenerateCLICompletion(ctx context.Context, projCfg *config.ProjectConfig, script []byte) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}
	if config.IsDryRunEnabled(ctx) {
		return nil
	}

	completionsDir := filepath.Join(shellScriptsDirOf(projCfg), "zsh", "completions")
	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		fsys := o.getTrackedFS(ctx, tx, "system", "completion")
		if err := fsys.MkdirAll(completionsDir, 0755); err != nil {
			return fmt.Errorf("creating completions directory: %w", err)
		}
		if err := fsys.WriteFile(filepath.Join(completionsDir, cliCompletionFileName), script, 0644); err != nil {
			return fmt.Errorf("writing CLI completion: %w", err)
		}
		return nil
	})
}
