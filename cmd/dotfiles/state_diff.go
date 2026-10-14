package main

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
	"github.com/spf13/cobra"
)

var diffJSON bool

var stateDiffCmd = &cobra.Command{
	Use:               "diff [tool]",
	Short:             "3-way drift between repo declarations, disk, and state DB",
	Args:              cobra.MaximumNArgs(1),
	ValidArgsFunction: completeToolName,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		if ctx == nil {
			ctx = context.Background()
		}
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		toolsToInspect := services.ToolConfigs
		if len(args) > 0 {
			targetTool := config.FindTool(services.ToolConfigs, args[0])
			if targetTool == nil {
				return fmt.Errorf("tool %q not found", args[0])
			}
			toolsToInspect = []*config.ToolConfig{targetTool}
		}

		inspector := drift.NewInspector(services.FS, services.Registry, services.ProjectConfig)
		var items []drift.Item
		var failures toolbatch.Failures
		log := GetLogger("diff", cmd.ErrOrStderr())
		for _, tool := range toolsToInspect {
			if err := ctx.Err(); err != nil {
				return err
			}
			if tool.Disabled {
				continue
			}
			inspected, err := inspector.InspectTool(ctx, tool)
			if err != nil {
				failures.Record(log, tool.Name, fmt.Errorf("inspecting drift: %w", err))
				continue
			}
			items = append(items, inspected...)
		}

		var driftedItems []drift.Item
		for _, item := range items {
			if item.State != drift.StateInSync {
				driftedItems = append(driftedItems, item)
			}
		}

		if diffJSON {
			if err := cliout.RenderJSON(cmd.OutOrStdout(), map[string]any{
				"hasDrift": len(driftedItems) > 0,
				"items":    driftedItems,
			}); err != nil {
				return err
			}
			return failures.Err()
		}

		if len(driftedItems) == 0 {
			if err := failures.Err(); err != nil {
				return err
			}
			if cliout.IsAgentMode() {
				fmt.Fprintln(cmd.OutOrStdout(), "OK: all files in-sync")
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "All managed files and blocks are in-sync.")
			}
			return nil
		}

		if cliout.IsAgentMode() {
			for _, item := range driftedItems {
				blockSuffix := ""
				if item.BlockID != "" {
					blockSuffix = fmt.Sprintf(" block:%s", item.BlockID)
				}
				fmt.Fprintf(cmd.OutOrStdout(), "DRIFT: tool:%s path:%s type:%s state:%s%s\n",
					item.ToolName, item.FilePath, item.Type, item.State, blockSuffix)
				if item.Diff != "" {
					fmt.Fprintln(cmd.OutOrStdout(), item.Diff)
				}
			}
		} else {
			fmt.Fprintf(cmd.OutOrStdout(), "Found %d drifted or modified artifact(s):\n\n", len(driftedItems))
			for _, item := range driftedItems {
				targetDesc := item.FilePath
				if item.BlockID != "" {
					targetDesc = fmt.Sprintf("%s (block %s)", item.FilePath, item.BlockID)
				}
				fmt.Fprintf(cmd.OutOrStdout(), "• [%s] %s (%s, state: %s)\n",
					item.ToolName, targetDesc, item.Type, item.State)
				if item.Diff != "" {
					fmt.Fprintln(cmd.OutOrStdout(), item.Diff)
				}
			}
		}

		return failures.Err()
	},
}

func init() {
	stateDiffCmd.Flags().BoolVar(&diffJSON, "json", false, "Output results in JSON format")
}
