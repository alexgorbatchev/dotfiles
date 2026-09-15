package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/spf13/cobra"
)

var detectConflictsJSON bool

type ConflictItem struct {
	ToolName string `json:"tool"`
	Path     string `json:"path"`
	Reason   string `json:"reason"`
}

var detectConflictsCmd = &cobra.Command{
	Use:   "detect-conflicts",
	Short: "Detects conflicts with existing non-generator files",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("detect-conflicts", cmd.ErrOrStderr())
		log.Info("Detecting file conflicts...")

		shimGen := shim.NewGenerator(services.FS)
		var conflicts []ConflictItem
		var conflictMessages []string

		for _, tool := range services.ToolConfigs {
			for _, binName := range installer.GetBinaryNames(tool.Name, tool.Binaries) {
				if binName == "" {
					continue
				}

				shimPath := filepath.Join(services.ProjectConfig.Paths.TargetDir, binName)
				exists, err := services.FS.Exists(shimPath)
				if err == nil && exists {
					isShim, err := shimGen.IsGeneratedShim(shimPath)
					if err == nil && !isShim {
						conflicts = append(conflicts, ConflictItem{
							ToolName: tool.Name,
							Path:     shimPath,
							Reason:   "exists but is not a generator shim",
						})
						conflictMessages = append(conflictMessages, fmt.Sprintf("[%s]: %s (exists but is not a generator shim)", tool.Name, shimPath))
					}
				}
			}
		}

		if detectConflictsJSON {
			_ = cliout.RenderJSON(cmd.OutOrStdout(), map[string]any{
				"hasConflicts": len(conflicts) > 0,
				"conflicts":    conflicts,
			})
			if len(conflicts) > 0 {
				return fmt.Errorf("conflicts detected with files not owned by the generator")
			}
			return nil
		}

		if len(conflictMessages) > 0 {
			if cliout.IsAgentMode() {
				for _, c := range conflicts {
					fmt.Fprintf(cmd.OutOrStdout(), "ERR: conflict tool:%s path:%s reason:%s\n", c.ToolName, c.Path, c.Reason)
				}
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "Conflicts detected with files not owned by the generator:")
				for _, msg := range conflictMessages {
					fmt.Fprintf(cmd.OutOrStdout(), "  - %s\n", msg)
				}
			}
			return fmt.Errorf("conflicts detected with files not owned by the generator")
		}

		if cliout.IsAgentMode() {
			fmt.Fprintln(cmd.OutOrStdout(), "OK: no conflicts")
		} else {
			fmt.Fprintln(cmd.OutOrStdout(), "No conflicts detected")
		}
		return nil
	},
}

func init() {
	detectConflictsCmd.Flags().BoolVar(&detectConflictsJSON, "json", false, "Output results in JSON format")
	rootCmd.AddCommand(detectConflictsCmd)
}
