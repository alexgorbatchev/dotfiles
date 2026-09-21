package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var stateGenerateCmd = &cobra.Command{
	Use:   "generate",
	Args:  cobra.NoArgs,
	Short: "Compile and link shims, symlinks, blocks, and templates",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		if overwrite {
			ctx = config.WithOverwrite(ctx, true)
		}
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("generate", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		log.Info("Starting generation...")

		// Execute standalone generation of all tool configurations through the Orchestrator
		err = services.Orchestrator.GenerateTools(ctx, services.ToolConfigs, services.ProjectConfig)
		if err != nil {
			return err
		}

		// Tool completion failures are logged rather than fatal, and the CLI's own
		// completion follows the same rule: a broken Tab must not fail generation.
		if err := writeCLICompletion(ctx, services); err != nil {
			log.Error("Failed to write CLI completion", err)
		}

		// Source the generated scripts from the profiles named by features.shellInstall.
		if shellInstall := services.ProjectConfig.Features.ShellInstall; shellInstall != nil {
			log.Info("Integrating generated shell scripts with profiles...")

			shellScriptsDir := services.ProjectConfig.Paths.ShellScriptsDir
			if shellScriptsDir == "" {
				shellScriptsDir = filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "shell-scripts")
			}

			inj := shellinit.NewInjector(services.FS)
			for _, target := range []struct{ shell, profile, script string }{
				{"zsh", shellInstall.Zsh, "main.zsh"},
				{"bash", shellInstall.Bash, "main.bash"},
				{"powershell", shellInstall.Powershell, "main.ps1"},
			} {
				if target.profile == "" {
					continue
				}
				injectProfile(log, inj, shellinit.InjectOptions{
					ProfilePath: utils.ExpandHomePath(services.ProjectConfig.Paths.HomeDir, target.profile),
					Shell:       target.shell,
					ScriptPath:  filepath.Join(shellScriptsDir, target.script),
				})
			}
		}

		return nil
	},
}

// injectProfile makes the profile source the generated script. Only an existing
// profile is touched: v1 updated profiles with onlyIfExists, and the file belongs to
// the user, so a missing one is reported with what to do rather than created.
func injectProfile(log *logger.Logger, inj *shellinit.Injector, opts shellinit.InjectOptions) {
	plog := log.WithTag(opts.ProfilePath)
	_, err := inj.Inject(opts)
	switch {
	case errors.Is(err, shellinit.ErrProfileNotFound):
		plog.Warn(logger.Message(fmt.Sprintf("Profile not found, skipping; create it and rerun \"dotfiles generate\" to have it source %s", opts.ScriptPath)))
	case err != nil:
		plog.Error("Failed shell profile injection", err)
	}
}

var overwrite bool

// writeCLICompletion renders cobra's zsh completion for this binary and hands it to
// the orchestrator, which places it where the generated main.zsh's fpath finds it.
// Rendering here rather than in the orchestrator keeps cobra out of pkg/.
func writeCLICompletion(ctx context.Context, services *Services) error {
	var script bytes.Buffer
	if err := rootCmd.GenZshCompletion(&script); err != nil {
		return fmt.Errorf("rendering zsh completion: %w", err)
	}
	return services.Orchestrator.GenerateCLICompletion(ctx, services.ProjectConfig, script.Bytes())
}

func init() {
	stateGenerateCmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite conflicting files that were not created by the generator")
}
