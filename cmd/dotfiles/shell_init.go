package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var shellInitCmd = &cobra.Command{
	Use:       "init [shell]",
	Args:      cobra.MaximumNArgs(1),
	ValidArgs: []string{"zsh", "bash", "powershell", "pwsh", "fish"},
	Short:     "Emit export strings and shell hooks (like brew shellenv)",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		targetDir := services.ProjectConfig.Paths.TargetDir
		shellScriptsDir := services.ProjectConfig.Paths.ShellScriptsDir

		sh := ""
		if len(args) > 0 {
			sh = strings.ToLower(strings.TrimSpace(args[0]))
		} else {
			shellEnv := os.Getenv("SHELL")
			if strings.HasSuffix(shellEnv, "/zsh") || shellEnv == "zsh" {
				sh = "zsh"
			} else if strings.HasSuffix(shellEnv, "/bash") || shellEnv == "bash" {
				sh = "bash"
			} else if strings.HasSuffix(shellEnv, "/fish") || shellEnv == "fish" {
				sh = "fish"
			}
		}

		switch sh {
		case "powershell", "pwsh":
			fmt.Fprintf(cmd.OutOrStdout(), "$env:PATH = \"%s;$env:PATH\"\n", targetDir)
			mainPs1 := filepath.Join(shellScriptsDir, "main.ps1")
			if exists, _ := fileExists(mainPs1); exists {
				fmt.Fprintf(cmd.OutOrStdout(), "if (Test-Path %q) { . %q }\n", mainPs1, mainPs1)
			}
		case "fish":
			fmt.Fprintf(cmd.OutOrStdout(), "fish_add_path %q\n", targetDir)
		case "zsh":
			fmt.Fprintf(cmd.OutOrStdout(), "export PATH=\"%s:$PATH\"\n", targetDir)
			mainZsh := filepath.Join(shellScriptsDir, "main.zsh")
			if exists, _ := fileExists(mainZsh); exists {
				fmt.Fprintf(cmd.OutOrStdout(), "[[ -f %q ]] && source %q\n", mainZsh, mainZsh)
			}
		case "bash":
			fmt.Fprintf(cmd.OutOrStdout(), "export PATH=\"%s:$PATH\"\n", targetDir)
			mainBash := filepath.Join(shellScriptsDir, "main.bash")
			if exists, _ := fileExists(mainBash); exists {
				fmt.Fprintf(cmd.OutOrStdout(), "[[ -f %q ]] && . %q\n", mainBash, mainBash)
			}
		default:
			fmt.Fprintf(cmd.OutOrStdout(), "export PATH=\"%s:$PATH\"\n", targetDir)
		}

		return nil
	},
}
