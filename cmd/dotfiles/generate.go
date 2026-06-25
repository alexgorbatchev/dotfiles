package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
	"github.com/spf13/cobra"
)

var generateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Orchestrates shim and symlink generation",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("generate", cmd.ErrOrStderr())
		log.Info("Starting generation...")

		// Execute standalone generation of all tool configurations through the Orchestrator
		err = services.Orchestrator.GenerateTools(ctx, services.ToolConfigs, services.ProjectConfig)
		if err != nil {
			return err
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

			// Define helper to resolve profile path
			resolvePath := func(p string) string {
				if p == "~" {
					return services.ProjectConfig.Paths.HomeDir
				}
				if strings.HasPrefix(p, "~/") {
					return filepath.Join(services.ProjectConfig.Paths.HomeDir, p[2:])
				}
				return p
			}

			if shellInstall.Zsh != "" {
				pPath := resolvePath(shellInstall.Zsh)
				scriptPath := filepath.Join(shellScriptsDir, "main.zsh")
				exists, err := services.FS.Exists(pPath)
				if err == nil && exists {
					_, err = inj.Inject(shellinit.InjectOptions{
						ProfilePath: pPath,
						Shell:       "zsh",
						ScriptPath:  scriptPath,
					})
					if err != nil {
						log.Warn(logger.Message(fmt.Sprintf("failed to inject into %s: %v", pPath, err)))
					}
				}
			}

			if shellInstall.Bash != "" {
				pPath := resolvePath(shellInstall.Bash)
				scriptPath := filepath.Join(shellScriptsDir, "main.bash")
				exists, err := services.FS.Exists(pPath)
				if err == nil && exists {
					_, err = inj.Inject(shellinit.InjectOptions{
						ProfilePath: pPath,
						Shell:       "bash",
						ScriptPath:  scriptPath,
					})
					if err != nil {
						log.Warn(logger.Message(fmt.Sprintf("failed to inject into %s: %v", pPath, err)))
					}
				}
			}

			if shellInstall.Powershell != "" {
				pPath := resolvePath(shellInstall.Powershell)
				scriptPath := filepath.Join(shellScriptsDir, "main.ps1")
				exists, err := services.FS.Exists(pPath)
				if err == nil && exists {
					_, err = inj.Inject(shellinit.InjectOptions{
						ProfilePath: pPath,
						Shell:       "powershell",
						ScriptPath:  scriptPath,
					})
					if err != nil {
						log.Warn(logger.Message(fmt.Sprintf("failed to inject into %s: %v", pPath, err)))
					}
				}
			}
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

var overwrite bool

func init() {
	generateCmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite conflicting files that were not created by the generator")
	rootCmd.AddCommand(generateCmd)
}
