package main

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/spf13/cobra"
)

var toolFilesJSON bool

func buildDirTree(fsys fs.FS, dirPath string) ([]*cliout.TreeNode, error) {
	entries, err := fsys.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	var nodes []*cliout.TreeNode
	for _, entry := range entries {
		fullPath := filepath.Join(dirPath, entry)
		isDir := false
		if st, err := fsys.Stat(fullPath); err == nil {
			isDir = st.IsDir()
		}
		node := &cliout.TreeNode{
			Name:  entry,
			IsDir: isDir,
		}
		if isDir {
			node.Children, _ = buildDirTree(fsys, fullPath)
		}
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir == nodes[j].IsDir {
			return nodes[i].Name < nodes[j].Name
		}
		return nodes[i].IsDir
	})
	return nodes, nil
}

var toolFilesCmd = &cobra.Command{
	Use:               "files [tool]",
	Args:              cobra.MaximumNArgs(1),
	Short:             "Display directory tree or files installed by a tool",
	ValidArgsFunction: completeToolName,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("files", cmd.ErrOrStderr())
		log.Info("Inspecting managed files...")

		if len(args) > 0 {
			toolName := args[0]
			inst, err := services.Registry.GetToolInstallation(ctx, toolName)
			if err != nil || inst == nil {
				return fmt.Errorf("tool installation not found: %s", toolName)
			}
			exists, err := services.FS.Exists(inst.InstallPath)
			if err != nil || !exists {
				return fmt.Errorf("install path not found: %s", inst.InstallPath)
			}

			nodes, err := buildDirTree(services.FS, inst.InstallPath)
			if err != nil || len(nodes) == 0 {
				if toolFilesJSON {
					return cliout.RenderJSON(cmd.OutOrStdout(), map[string]any{
						"tool":        toolName,
						"installPath": inst.InstallPath,
						"files":       []any{},
					})
				}
				fmt.Fprintln(cmd.OutOrStdout(), inst.InstallPath)
				fmt.Fprintln(cmd.OutOrStdout(), "(empty directory)")
				return nil
			}

			if toolFilesJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), map[string]any{
					"tool":        toolName,
					"installPath": inst.InstallPath,
					"files":       nodes,
				})
			}

			fmt.Fprintln(cmd.OutOrStdout(), inst.InstallPath)
			fmt.Fprintln(cmd.OutOrStdout(), cliout.FormatTree(nodes))
			return nil
		}

		// The registry keeps an append-only operation log; the current view folds it
		// down to one state per path and drops paths whose last operation removed them.
		states, err := services.Registry.GetFileStates(ctx)
		if err != nil {
			return err
		}
		if states == nil {
			states = []*registry.FileState{}
		}

		if toolFilesJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), states)
		}

		if len(states) == 0 {
			if cliout.IsAgentMode() {
				fmt.Fprintln(cmd.OutOrStdout(), "no files managed")
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "No files currently managed")
			}
			return nil
		}

		for _, state := range states {
			if cliout.IsAgentMode() {
				fmt.Fprintf(cmd.OutOrStdout(), "tool:%s type:%s path:%s\n", state.ToolName, state.FileType, state.FilePath)
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "- %s (%s): %s\n", state.ToolName, state.FileType, state.FilePath)
			}
		}
		return nil
	},
}

func init() {
	toolFilesCmd.Flags().BoolVar(&toolFilesJSON, "json", false, "Output results in JSON format")
}
