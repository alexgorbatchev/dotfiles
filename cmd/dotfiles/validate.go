package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

type ValidationError struct {
	ToolName string
	Config   string
	Message  string
}

type ValidationWarning struct {
	ToolName string
	Config   string
	Message  string
}

var validateCmd = &cobra.Command{
	Use:   "validate [tool]",
	Short: "Validates tool configuration files for schema issues and errors",
	Long: `Validates tool configuration files (.tool.ts) and project configuration for schema issues, missing parameters, invalid installer methods, and bad shell settings.

When run without arguments, 'dotfiles validate' checks all configured tools.
When a tool name is provided (e.g. 'dotfiles validate ripgrep'), it validates only that specific tool.`,
	Example: `  # Validate all tool configurations
  dotfiles validate

  # Validate a specific tool configuration
  dotfiles validate ripgrep`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return fmt.Errorf("failed loading configuration: %w", err)
		}
		defer services.DB.Close()

		log := GetLogger("validate", cmd.ErrOrStderr())
		log.Info("Validating tool configurations...")

		instReg := installer.DefaultRegistry()
		var targetTools []*config.ToolConfig

		if len(args) > 0 {
			targetName := args[0]
			for _, tc := range services.ToolConfigs {
				if tc.Name == targetName {
					targetTools = append(targetTools, tc)
					break
				}
			}
			if len(targetTools) == 0 {
				return fmt.Errorf("tool %q not found in configuration", targetName)
			}
		} else {
			targetTools = services.ToolConfigs
		}

		knownToolNames := make(map[string]bool)
		for _, tc := range services.ToolConfigs {
			if tc.Name != "" {
				knownToolNames[tc.Name] = true
			}
		}

		var errors []ValidationError
		var warnings []ValidationWarning

		for _, tool := range targetTools {
			if tool.Name == "" {
				errors = append(errors, ValidationError{
					ToolName: "<unnamed>",
					Config:   tool.ConfigFilePath,
					Message:  "Tool configuration is missing a name",
				})
				continue
			}

			// Validate installation method
			if tool.InstallationMethod == "" {
				warnings = append(warnings, ValidationWarning{
					ToolName: tool.Name,
					Config:   tool.ConfigFilePath,
					Message:  "No installation method specified (install() was called without arguments)",
				})
			} else {
				inst, err := instReg.Get(tool.InstallationMethod)
				if err != nil {
					errors = append(errors, ValidationError{
						ToolName: tool.Name,
						Config:   tool.ConfigFilePath,
						Message:  fmt.Sprintf("Unknown installation method %q", tool.InstallationMethod),
					})
				} else if inst != nil {
					// Validate required params per method
					switch tool.InstallationMethod {
					case "github-release":
						repo, _ := tool.InstallParams["repo"].(string)
						if strings.TrimSpace(repo) == "" {
							errors = append(errors, ValidationError{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  "'github-release' installer requires a 'repo' parameter (e.g. 'owner/repo')",
							})
						} else if !strings.Contains(repo, "/") {
							errors = append(errors, ValidationError{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  fmt.Sprintf("Invalid 'repo' parameter %q for github-release (expected 'owner/repo')", repo),
							})
						}
					case "gitea-release":
						repo, _ := tool.InstallParams["repo"].(string)
						if strings.TrimSpace(repo) == "" {
							errors = append(errors, ValidationError{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  "'gitea-release' installer requires a 'repo' parameter",
							})
						}
					case "curl-script", "curl-tar", "curl-binary":
						url, _ := tool.InstallParams["url"].(string)
						if strings.TrimSpace(url) == "" {
							errors = append(errors, ValidationError{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  fmt.Sprintf("'%s' installer requires a 'url' parameter", tool.InstallationMethod),
							})
						}
					case "zsh-plugin":
						repo, _ := tool.InstallParams["repo"].(string)
						url, _ := tool.InstallParams["url"].(string)
						if strings.TrimSpace(repo) == "" && strings.TrimSpace(url) == "" {
							errors = append(errors, ValidationError{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  "'zsh-plugin' installer requires a 'repo' or 'url' parameter",
							})
						}
					case "apt", "dnf", "pacman":
						if !tool.Sudo {
							warnings = append(warnings, ValidationWarning{
								ToolName: tool.Name,
								Config:   tool.ConfigFilePath,
								Message:  fmt.Sprintf("System package installer %q usually requires .sudo() elevation", tool.InstallationMethod),
							})
						}
					}
				}
			}

			// Validate shell configs (check for PATH in env)
			checkShellConfig := func(shellName string, sc *config.ShellTypeConfig) {
				if sc == nil {
					return
				}
				for envKey := range sc.Env {
					if strings.ToUpper(envKey) == "PATH" {
						errors = append(errors, ValidationError{
							ToolName: tool.Name,
							Config:   tool.ConfigFilePath,
							Message:  fmt.Sprintf("%s shell config sets PATH via .env() — use .path() instead", shellName),
						})
					}
				}
			}
			if tool.ShellConfigs != nil {
				checkShellConfig("zsh", tool.ShellConfigs.Zsh)
				checkShellConfig("bash", tool.ShellConfigs.Bash)
				checkShellConfig("powershell", tool.ShellConfigs.Powershell)
			}

			// Validate dependencies
			for _, dep := range tool.Dependencies {
				if dep != "" && !knownToolNames[dep] {
					warnings = append(warnings, ValidationWarning{
						ToolName: tool.Name,
						Config:   tool.ConfigFilePath,
						Message:  fmt.Sprintf("Declared dependency %q is not found among configured tools", dep),
					})
				}
			}
		}

		out := cmd.OutOrStdout()
		if len(warnings) > 0 {
			fmt.Fprintf(out, "⚠️ %d warning(s) found:\n", len(warnings))
			for _, w := range warnings {
				relPath := w.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, w.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "  - [%s] %s: %s\n", relPath, w.ToolName, w.Message)
			}
		}

		if len(errors) > 0 {
			fmt.Fprintf(out, "✖ %d validation error(s) found:\n", len(errors))
			for _, e := range errors {
				relPath := e.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, e.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "  - [%s] %s: %s\n", relPath, e.ToolName, e.Message)
			}
			return fmt.Errorf("validation failed with %d error(s)", len(errors))
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		fmt.Fprintf(out, "✔ Checked %d tool configuration(s) — all valid!\n", len(targetTools))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(validateCmd)
}
