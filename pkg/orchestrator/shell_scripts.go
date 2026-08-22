package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
)

func (o *Orchestrator) generateShellScripts(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	shellScriptsDir := projCfg.Paths.ShellScriptsDir
	if shellScriptsDir == "" {
		shellScriptsDir = filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		fsys := o.getTrackedFS(ctx, tx, "system", "init")

		// 1. Ensure directories exist
		if err := fsys.MkdirAll(shellScriptsDir, 0755); err != nil {
			return err
		}
		onceDir := filepath.Join(shellScriptsDir, ".once")
		if err := fsys.MkdirAll(onceDir, 0755); err != nil {
			return err
		}

		// Prune existing files in .once/ during consecutive generate commands
		for i := 1; i <= 1000; i++ {
			for _, ext := range []string{"zsh", "bash", "sh", "ps1"} {
				filePath := filepath.Join(onceDir, fmt.Sprintf("once-%03d.%s", i, ext))
				if exists, err := fsys.Exists(filePath); err == nil && exists {
					_ = fsys.Remove(filePath)
				}
			}
		}

		// We generate for zsh, bash, powershell
		shells := []string{"zsh", "bash", "powershell"}

		for _, sh := range shells {
			var scriptLines []string

			// 1. File Header
			scriptLines = append(scriptLines, shellinit.GenerateFileHeader(projCfg.Paths.DotfilesDir))

			// 2. Dotfiles CLI Section
			scriptLines = append(scriptLines, shellinit.GenerateSectionHeader("Dotfiles CLI"))
			dotfilesBin := filepath.ToSlash(filepath.Join(projCfg.Paths.TargetDir, "dotfiles"))
			var wrapper string
			if o.configFilePath != "" {
				if sh == "powershell" {
					wrapper = fmt.Sprintf("function dotfiles {\n  & %q --config %q $args\n}", dotfilesBin, o.configFilePath)
				} else {
					wrapper = fmt.Sprintf("dotfiles() {\n  %q --config %q \"$@\"\n}", dotfilesBin, o.configFilePath)
				}
			} else {
				if sh == "powershell" {
					wrapper = fmt.Sprintf("function dotfiles {\n  & %q $args\n}", dotfilesBin)
				} else {
					wrapper = fmt.Sprintf("dotfiles() {\n  %q \"$@\"\n}", dotfilesBin)
				}
			}
			scriptLines = append(scriptLines, wrapper)
			scriptLines = append(scriptLines, "")

			// 3. PATH Modifications Section
			scriptLines = append(scriptLines, shellinit.GenerateSectionHeader("PATH Modifications"))
			scriptLines = append(scriptLines, shellinit.FormatPath(sh, projCfg.Paths.TargetDir))
			scriptLines = append(scriptLines, "")

			// 4. Environment Variables Section (hoisted)
			var envLines []string
			for _, tool := range tools {
				if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
					continue
				}
				var stc *config.ShellTypeConfig
				if tool.ShellConfigs != nil {
					if sh == "zsh" {
						stc = tool.ShellConfigs.Zsh
					} else if sh == "bash" {
						stc = tool.ShellConfigs.Bash
					} else {
						stc = tool.ShellConfigs.Powershell
					}
				}
				if stc == nil || len(stc.Env) == 0 {
					continue
				}
				envKeys := make([]string, 0, len(stc.Env))
				for k := range stc.Env {
					envKeys = append(envKeys, k)
				}
				sort.Strings(envKeys)
				for _, k := range envKeys {
					vResolved, err := o.resolvePlaceholder(stc.Env[k], tool, projCfg)
					if err != nil {
						return fmt.Errorf("resolving env variable %q: %w", k, err)
					}
					if tool.ConfigFilePath != "" {
						envLines = append(envLines, fmt.Sprintf("# %s", tool.ConfigFilePath))
					}
					if sh == "powershell" {
						envLines = append(envLines, fmt.Sprintf("$env:%s = %q", k, vResolved))
					} else {
						envLines = append(envLines, fmt.Sprintf("export %s=%q", k, vResolved))
					}
				}
			}
			if len(envLines) > 0 {
				scriptLines = append(scriptLines, shellinit.GenerateSectionHeader("Environment Variables"))
				scriptLines = append(scriptLines, strings.Join(envLines, "\n"))
				scriptLines = append(scriptLines, "")
			}

			// 5. Tool-Specific Initializations
			scriptLines = append(scriptLines, shellinit.GenerateSectionHeader("Tool-Specific Initializations"))

			onceCounter := 1
			for _, tool := range tools {
				if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
					continue
				}

				var toolBlockLines []string

				if sh == "zsh" && tool.InstallationMethod == "zsh-plugin" {
					pluginName := getStringParam(tool.InstallParams, "pluginName", "")
					if pluginName == "" {
						repo := getStringParam(tool.InstallParams, "repo", "")
						if repo != "" {
							parts := strings.Split(repo, "/")
							if len(parts) == 2 {
								pluginName = parts[1]
							} else {
								pluginName = repo
							}
						} else {
							pluginName = tool.Name
						}
					}
					pluginPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current")
					candidates := []string{
						pluginName + ".plugin.zsh",
						pluginName + ".zsh",
						"init.zsh",
						"plugin.zsh",
						pluginName + ".zsh-theme",
					}
					sourceFile := ""
					explicitSource := getStringParam(tool.InstallParams, "source", "")
					if explicitSource != "" {
						sourceFile = explicitSource
					} else {
						for _, candidate := range candidates {
							subCandidate := filepath.Join(pluginName, candidate)
							if ex, _ := fsys.Exists(filepath.Join(pluginPath, subCandidate)); ex {
								sourceFile = subCandidate
								break
							}
							if ex, _ := fsys.Exists(filepath.Join(pluginPath, candidate)); ex {
								sourceFile = candidate
								break
							}
						}
						if sourceFile == "" {
							sourceFile = filepath.Join(pluginName, pluginName+".plugin.zsh")
						}
					}
					if sourceFile != "" {
						fullSourcePath := filepath.ToSlash(filepath.Join(pluginPath, sourceFile))
						cliCmd := o.getCliCommand()
						cfgFile := o.getConfigFilePath()

						toolBlockLines = append(toolBlockLines,
							fmt.Sprintf("if [ ! -f %q ]; then", fullSourcePath),
							fmt.Sprintf("  %s install --shim-mode --config %q %q", cliCmd, cfgFile, tool.Name),
							"fi",
							fmt.Sprintf("source %q", fullSourcePath),
						)
					}
				}

				var stc *config.ShellTypeConfig
				if tool.ShellConfigs != nil {
					if sh == "zsh" {
						stc = tool.ShellConfigs.Zsh
					} else if sh == "bash" {
						stc = tool.ShellConfigs.Bash
					} else if sh == "powershell" {
						stc = tool.ShellConfigs.Powershell
					}
				}

				if stc != nil {
					// Aliases
					if len(stc.Aliases) > 0 {
						aliasKeys := make([]string, 0, len(stc.Aliases))
						for k := range stc.Aliases {
							aliasKeys = append(aliasKeys, k)
						}
						sort.Strings(aliasKeys)
						for _, k := range aliasKeys {
							vResolved, err := o.resolvePlaceholder(stc.Aliases[k], tool, projCfg)
							if err != nil {
								return fmt.Errorf("resolving alias %q: %w", k, err)
							}
							if sh == "powershell" {
								toolBlockLines = append(toolBlockLines, fmt.Sprintf("Set-Alias -Name %s -Value %q", k, vResolved))
							} else {
								toolBlockLines = append(toolBlockLines, fmt.Sprintf("alias %s='%s'", k, strings.ReplaceAll(vResolved, "'", "'\\''")))
							}
						}
					}

					// Scripts
					for _, scr := range stc.Scripts {
						valResolved, err := o.resolvePlaceholder(scr.Value, tool, projCfg)
						if err != nil {
							return fmt.Errorf("resolving script: %w", err)
						}
						if scr.Kind == "always" {
							toolBlockLines = append(toolBlockLines, unindentString(valResolved))
						} else if scr.Kind == "once" {
							ext := sh
							if sh == "powershell" {
								ext = "ps1"
							} else if sh == "bash" {
								ext = "sh"
							}
							onceFileName := fmt.Sprintf("once-%03d.%s", onceCounter, ext)
							onceCounter++
							onceFilePath := filepath.Join(onceDir, onceFileName)

							var scriptContent string
							if sh == "powershell" {
								scriptContent = valResolved + "\nRemove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue\n"
							} else if sh == "zsh" {
								scriptContent = valResolved + "\nrm -f \"${(%):-%x}\"\n"
							} else {
								scriptContent = valResolved + "\nrm -f \"${BASH_SOURCE[0]}\"\n"
							}

							err := fsys.WriteFile(onceFilePath, []byte(scriptContent), 0777)
							if err != nil {
								return err
							}
						}
					}

					// Functions
					if len(stc.Functions) > 0 {
						funcKeys := make([]string, 0, len(stc.Functions))
						for name := range stc.Functions {
							funcKeys = append(funcKeys, name)
						}
						sort.Strings(funcKeys)
						for _, name := range funcKeys {
							body := stc.Functions[name]
							formattedBody := formatFunctionBody(body)
							if sh == "powershell" {
								toolBlockLines = append(toolBlockLines, fmt.Sprintf("function %s {\n%s\n}", name, formattedBody))
							} else {
								toolBlockLines = append(toolBlockLines, fmt.Sprintf("%s() {\n%s\n}", name, formattedBody))
							}
						}
					}

					cleanToolName := strings.ReplaceAll(tool.Name, "-", "_")

					// SourceFiles
					for _, relPath := range stc.SourceFiles {
						var resolvedPath string
						if filepath.IsAbs(relPath) {
							resolvedPath = relPath
						} else {
							toolConfigDir := filepath.Dir(tool.ConfigFilePath)
							resolvedPath = filepath.Join(toolConfigDir, relPath)
						}
						resolvedPath = filepath.ToSlash(resolvedPath)

						if sh == "powershell" {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("if (Test-Path %q) { . %q }", resolvedPath, resolvedPath))
						} else {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("[[ -f %q ]] && source %q", resolvedPath, resolvedPath))
						}
					}

					// Sources
					for i, content := range stc.Sources {
						funcName := fmt.Sprintf("__dotfiles_source_inline_%s_%d", cleanToolName, i)
						formattedContent := formatFunctionBody(content)
						if sh == "powershell" {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("function %s {\n%s\n}", funcName, formattedContent))
							toolBlockLines = append(toolBlockLines, fmt.Sprintf(". (%s)", funcName))
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("Remove-Item Function:\\%s -ErrorAction SilentlyContinue", funcName))
						} else {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("%s() {\n%s\n}", funcName, formattedContent))
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("source <(%s)", funcName))
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("unset -f %s", funcName))
						}
					}

					// SourceFunctions
					for _, funcName := range stc.SourceFunctions {
						if sh == "powershell" {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf(". (%s)", funcName))
						} else {
							toolBlockLines = append(toolBlockLines, fmt.Sprintf("source <(%s)", funcName))
						}
					}
				}

				if len(toolBlockLines) > 0 {
					scriptLines = append(scriptLines, shellinit.GenerateToolHeader(tool.ConfigFilePath))
					scriptLines = append(scriptLines, strings.Join(toolBlockLines, "\n"))
				}
			}
			scriptLines = append(scriptLines, "")

			// 6. Once script loop
			if onceCounter > 1 {
				scriptLines = append(scriptLines, shellinit.FormatOnceLoop(sh, onceDir))
				scriptLines = append(scriptLines, "")
			}

			// 7. Shell Completions Setup
			if sh == "zsh" {
				scriptLines = append(scriptLines, shellinit.GenerateSectionHeader("Shell Completions Setup"))
				completionsDir := filepath.Join(shellScriptsDir, "zsh", "completions")
				if err := fsys.MkdirAll(completionsDir, 0755); err != nil {
					return err
				}
				scriptLines = append(scriptLines, shellinit.FormatFpath(completionsDir))
				scriptLines = append(scriptLines, "")
			}

			// 8. End of Generated File
			scriptLines = append(scriptLines, shellinit.GenerateEndOfFile())

			// Write main file
			ext := sh
			if sh == "powershell" {
				ext = "ps1"
			}
			mainFilePath := filepath.Join(shellScriptsDir, "main."+ext)
			err := fsys.WriteFile(mainFilePath, []byte(strings.Join(scriptLines, "\n")+"\n"), 0666)
			if err != nil {
				return err
			}
		}

		return nil
	})
}

func unindentString(s string) string {
	lines := strings.Split(s, "\n")
	for len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
		lines = lines[1:]
	}
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 {
		return ""
	}

	firstLine := lines[0]
	baseIndent := len(firstLine) - len(strings.TrimLeft(firstLine, " \t"))

	var formatted []string
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			formatted = append(formatted, "")
			continue
		}
		indent := len(l) - len(strings.TrimLeft(l, " \t"))
		cut := baseIndent
		if indent < cut {
			cut = indent
		}
		formatted = append(formatted, l[cut:])
	}
	return strings.Join(formatted, "\n")
}

func formatFunctionBody(body string) string {
	lines := strings.Split(body, "\n")
	for len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
		lines = lines[1:]
	}
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 {
		return ""
	}

	// Base indent is defined by the first non-empty line of the function body
	firstLine := lines[0]
	baseIndent := len(firstLine) - len(strings.TrimLeft(firstLine, " \t"))

	var formatted []string
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			formatted = append(formatted, "")
			continue
		}
		indent := len(l) - len(strings.TrimLeft(l, " \t"))
		cut := baseIndent
		if indent < cut {
			cut = indent
		}
		formatted = append(formatted, "  "+l[cut:])
	}
	return strings.Join(formatted, "\n")
}
