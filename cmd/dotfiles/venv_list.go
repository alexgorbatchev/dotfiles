package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
	"github.com/spf13/cobra"
)

var venvListJSON bool

type VenvListItem struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Active bool   `json:"active"`
}

var venvListCmd = &cobra.Command{
	Use:   "list",
	Args:  cobra.NoArgs,
	Short: "List detected virtual environments",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		cwd, err := os.Getwd()
		if err != nil {
			return err
		}

		vManager := venv.NewManager(services.FS)
		activeEnv := venv.GetActiveEnv(nil)

		entries, err := os.ReadDir(cwd)
		if err != nil {
			return fmt.Errorf("reading current directory: %w", err)
		}

		var envs []VenvListItem
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			dirPath := filepath.Join(cwd, entry.Name())
			if valid, _ := vManager.IsValidEnv(dirPath); valid {
				isActive := activeEnv.Active && filepath.Clean(activeEnv.EnvDir) == filepath.Clean(dirPath)
				envs = append(envs, VenvListItem{
					Name:   entry.Name(),
					Path:   dirPath,
					Active: isActive,
				})
			}
		}

		if activeEnv.Active {
			found := false
			for _, e := range envs {
				if e.Path == filepath.Clean(activeEnv.EnvDir) {
					found = true
					break
				}
			}
			if !found {
				envs = append(envs, VenvListItem{
					Name:   activeEnv.EnvName,
					Path:   activeEnv.EnvDir,
					Active: true,
				})
			}
		}

		slices.SortFunc(envs, func(a, b VenvListItem) int {
			if a.Name < b.Name {
				return -1
			}
			if a.Name > b.Name {
				return 1
			}
			return 0
		})

		if venvListJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), envs)
		}

		if len(envs) == 0 {
			if cliout.IsAgentMode() {
				fmt.Fprintln(cmd.OutOrStdout(), "no virtual environments detected")
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "No virtual environments detected.")
			}
			return nil
		}

		for _, e := range envs {
			activeTag := ""
			if e.Active {
				activeTag = " (active)"
			}
			if cliout.IsAgentMode() {
				fmt.Fprintf(cmd.OutOrStdout(), "name:%s path:%s active:%v\n", e.Name, e.Path, e.Active)
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "- %s%s: %s\n", e.Name, activeTag, e.Path)
			}
		}

		return nil
	},
}

func init() {
	venvListCmd.Flags().BoolVar(&venvListJSON, "json", false, "Output in JSON format")
}
