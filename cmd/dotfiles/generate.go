package main

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var generateCmd = &cobra.Command{
	Use:   "generate",
	Args:  cobra.NoArgs,
	Short: "Orchestrates shim and symlink generation",
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

		// Run shellinit profile updater if shellInstall features are configured
		if services.ProjectConfig.Features.ShellInstall != nil {
			log.Info("Integrating generated shell scripts with profiles...")
			inj := shellinit.NewInjector(services.FS)
			shellInstall := services.ProjectConfig.Features.ShellInstall

			shellScriptsDir := services.ProjectConfig.Paths.ShellScriptsDir
			if shellScriptsDir == "" {
				shellScriptsDir = filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "shell-scripts")
			}

			if shellInstall.Zsh != "" {
				pPath := utils.ExpandHomePath(services.ProjectConfig.Paths.HomeDir, shellInstall.Zsh)
				scriptPath := filepath.Join(shellScriptsDir, "main.zsh")
				_, err = inj.Inject(shellinit.InjectOptions{
					ProfilePath: pPath,
					Shell:       "zsh",
					ScriptPath:  scriptPath,
				})
				if err != nil {
					log.GetSubLogger("", pPath).Error("Failed shell profile injection", err)
				}
			}

			if shellInstall.Bash != "" {
				pPath := utils.ExpandHomePath(services.ProjectConfig.Paths.HomeDir, shellInstall.Bash)
				scriptPath := filepath.Join(shellScriptsDir, "main.bash")
				_, err = inj.Inject(shellinit.InjectOptions{
					ProfilePath: pPath,
					Shell:       "bash",
					ScriptPath:  scriptPath,
				})
				if err != nil {
					log.GetSubLogger("", pPath).Error("Failed shell profile injection", err)
				}
			}

			if shellInstall.Powershell != "" {
				pPath := utils.ExpandHomePath(services.ProjectConfig.Paths.HomeDir, shellInstall.Powershell)
				scriptPath := filepath.Join(shellScriptsDir, "main.ps1")
				_, err = inj.Inject(shellinit.InjectOptions{
					ProfilePath: pPath,
					Shell:       "powershell",
					ScriptPath:  scriptPath,
				})
				if err != nil {
					log.GetSubLogger("", pPath).Error("Failed shell profile injection", err)
				}
			}
		}

		return nil
	},
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
	generateCmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite conflicting files that were not created by the generator")
	rootCmd.AddCommand(generateCmd)
}
