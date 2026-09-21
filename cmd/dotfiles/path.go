package main

import (
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var pathJSON bool

func resolveAllPaths(services *Services) map[string]string {
	toolConfigsDirs := services.ProjectConfig.Paths.GetToolConfigsDirs()
	toolConfigsDir := ""
	if len(toolConfigsDirs) > 0 {
		toolConfigsDir = toolConfigsDirs[0]
	}
	cacheDir := filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "cache")
	return map[string]string{
		"target":       services.ProjectConfig.Paths.TargetDir,
		"binaries":     services.ProjectConfig.Paths.BinariesDir,
		"cache":        cacheDir,
		"dotfiles":     services.ProjectConfig.Paths.DotfilesDir,
		"generated":    services.ProjectConfig.Paths.GeneratedDir,
		"toolConfigs":  toolConfigsDir,
		"shellScripts": services.ProjectConfig.Paths.ShellScriptsDir,
		"home":         services.ProjectConfig.Paths.HomeDir,
	}
}

func lookupPath(paths map[string]string, name string) (string, bool) {
	key := strings.ToLower(strings.TrimSpace(name))
	key = strings.TrimSuffix(key, "dir")
	switch key {
	case "binary", "store":
		key = "binaries"
	case "config", "toolconfig", "tools":
		key = "toolconfigs"
	case "shellscript", "shell", "scripts":
		key = "shellscripts"
	case "dotfile":
		key = "dotfiles"
	}
	for k, v := range paths {
		if strings.ToLower(k) == key {
			return v, true
		}
	}
	return "", false
}

var pathCmd = &cobra.Command{
	Use:   "path [name]",
	Short: "Query configured system, binary, and storage directories",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) == 1 {
			return runPathGet(cmd, args[0])
		}
		return runPathList(cmd)
	},
}

func init() {
	pathCmd.PersistentFlags().BoolVar(&pathJSON, "json", false, "Output paths in JSON format")
	pathCmd.AddCommand(pathListCmd)
	pathCmd.AddCommand(pathGetCmd)
	rootCmd.AddCommand(pathCmd)
}
