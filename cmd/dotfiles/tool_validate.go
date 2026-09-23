package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/spf13/cobra"
)

var toolValidateJSON bool

type ValidationError struct {
	ToolName string `json:"tool"`
	Config   string `json:"config"`
	Message  string `json:"message"`
}

type ValidationWarning struct {
	ToolName string `json:"tool"`
	Config   string `json:"config"`
	Message  string `json:"message"`
}

var toolValidateCmd = &cobra.Command{
	Use:               "validate [tool]",
	Args:              cobra.MaximumNArgs(1),
	Short:             "Validate configuration schema, parameters, and types",
	ValidArgsFunction: completeToolName,
	Long: `Validates tool configuration files (.tool.ts) and project configuration for schema issues, missing parameters, invalid installer methods, and bad shell settings.

It then type-checks the TypeScript configuration with the compiler a configured tool provides
as the binary "tsc" (the scaffolded typescript.tool.ts), running it from that tool's current
directory rather than from PATH. A missing or uninstalled compiler is reported as an error.

When run without arguments, 'dotfiles tool validate' checks all configured tools.
When a tool name is provided (e.g. 'dotfiles tool validate ripgrep'), it validates only that specific tool.`,
	Example: `  # Validate all tool configurations
  dotfiles tool validate

  # Validate a specific tool configuration
  dotfiles tool validate ripgrep`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return fmt.Errorf("failed loading configuration: %w", err)
		}
		defer services.Close()

		log := GetLogger("validate", cmd.ErrOrStderr())
		log.Info("Validating tool configurations...")

		var targetTools []*config.ToolConfig

		if len(args) > 0 {
			targetName := args[0]
			targetTool := config.FindTool(services.ToolConfigs, targetName)
			if targetTool != nil {
				targetTools = append(targetTools, targetTool)
			}
			if len(targetTools) == 0 {
				return fmt.Errorf("tool %q not found in configuration", targetName)
			}
		} else {
			targetTools = services.ToolConfigs
		}

		// Every tool here has passed config.ValidateToolConfigs: the load that produced
		// services.ToolConfigs fails on the first tool that does not, so a missing name
		// or an unusable declaration never reaches this loop.
		knownToolNames := make(map[string]bool)
		for _, tc := range services.ToolConfigs {
			knownToolNames[tc.Name] = true
		}

		errors := []ValidationError{}
		warnings := []ValidationWarning{}

		for _, tool := range targetTools {
			// The load has already rejected a method no installer handles, so only the
			// parameters of a known one are left to check here.
			switch tool.InstallationMethod {
			case "":
				warnings = append(warnings, ValidationWarning{
					ToolName: tool.Name,
					Config:   tool.ConfigFilePath,
					Message:  "No installation method specified (install() was called without arguments)",
				})
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

		// Cross-tool configuration conflict detection
		dotfilesDir := ""
		if services.ProjectConfig != nil {
			dotfilesDir = services.ProjectConfig.Paths.DotfilesDir
		}
		conflicts := orchestrator.DetectConflicts(services.ToolConfigs, dotfilesDir)
		for _, c := range conflicts {
			if len(targetTools) > 0 {
				matched := false
				for _, t := range targetTools {
					if t.Name == c.ToolName {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
			}
			warnings = append(warnings, ValidationWarning{
				ToolName: c.ToolName,
				Config:   c.ConfigPath,
				Message:  c.Message,
			})
		}

		var only *config.ToolConfig
		if len(args) > 0 {
			only = targetTools[0]
		}
		typeErrors, err := typeCheckToolConfigs(ctx, services, log, only)
		if err != nil {
			return err
		}
		errors = append(errors, typeErrors...)

		out := cmd.OutOrStdout()

		if toolValidateJSON {
			if err := cliout.RenderJSON(out, map[string]any{
				"valid":    len(errors) == 0,
				"checked":  len(targetTools),
				"errors":   errors,
				"warnings": warnings,
			}); err != nil {
				return err
			}
			if len(errors) > 0 {
				return fmt.Errorf("validation failed with %d error(s)", len(errors))
			}
			return nil
		}

		if cliout.IsAgentMode() {
			for _, w := range warnings {
				relPath := w.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, w.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "WARN: [%s] %s: %s\n", relPath, w.ToolName, w.Message)
			}
			for _, e := range errors {
				relPath := e.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, e.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "ERR: [%s] %s: %s\n", relPath, e.ToolName, e.Message)
			}
			if len(errors) > 0 {
				return fmt.Errorf("validation failed with %d error(s)", len(errors))
			}
			fmt.Fprintf(out, "OK: %d tools valid\n", len(targetTools))
			return nil
		}

		if len(warnings) > 0 {
			fmt.Fprintf(out, "[WARN] %d warning(s) found:\n", len(warnings))
			for _, w := range warnings {
				relPath := w.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, w.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "  - [%s] %s: %s\n", relPath, w.ToolName, w.Message)
			}
		}

		if len(errors) > 0 {
			fmt.Fprintf(out, "[ERROR] %d validation error(s) found:\n", len(errors))
			for _, e := range errors {
				relPath := e.Config
				if rel, err := filepath.Rel(services.ProjectConfig.Paths.DotfilesDir, e.Config); err == nil && rel != "" {
					relPath = rel
				}
				fmt.Fprintf(out, "  - [%s] %s: %s\n", relPath, e.ToolName, e.Message)
			}
			return fmt.Errorf("validation failed with %d error(s)", len(errors))
		}

		fmt.Fprintf(out, "[OK] Checked %d tool configuration(s) — all valid!\n", len(targetTools))
		return nil
	},
}

func init() {
	toolValidateCmd.Flags().BoolVar(&toolValidateJSON, "json", false, "Output results in JSON format")
}
