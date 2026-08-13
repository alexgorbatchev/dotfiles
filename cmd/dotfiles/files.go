package main

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/spf13/cobra"
)

type treeNode struct {
	name     string
	isDir    bool
	children []*treeNode
}

func buildDirTree(fsys fs.FS, dirPath string) ([]*treeNode, error) {
	entries, err := fsys.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	var nodes []*treeNode
	for _, entry := range entries {
		fullPath := filepath.Join(dirPath, entry)
		isDir := false
		if st, err := fsys.Stat(fullPath); err == nil {
			isDir = st.IsDir()
		}
		node := &treeNode{
			name:  entry,
			isDir: isDir,
		}
		if isDir {
			node.children, _ = buildDirTree(fsys, fullPath)
		}
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].isDir == nodes[j].isDir {
			return nodes[i].name < nodes[j].name
		}
		return nodes[i].isDir
	})
	return nodes, nil
}

func formatTree(nodes []*treeNode, prefix string) string {
	var lines []string
	for i, node := range nodes {
		isLast := i == len(nodes)-1
		connector := "├─ "
		if isLast {
			connector = "└─ "
		}
		lines = append(lines, prefix+connector+node.name)
		if node.isDir && len(node.children) > 0 {
			childPrefix := prefix + "│  "
			if isLast {
				childPrefix = prefix + "   "
			}
			lines = append(lines, formatTree(node.children, childPrefix))
		}
	}
	return strings.Join(lines, "\n")
}

var filesCmd = &cobra.Command{
	Use:   "files [toolName]",
	Short: "Display a tree view of files in the tool installation directory or list managed files",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

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

			fmt.Fprintln(cmd.OutOrStdout(), inst.InstallPath)
			nodes, err := buildDirTree(services.FS, inst.InstallPath)
			if err != nil || len(nodes) == 0 {
				fmt.Fprintln(cmd.OutOrStdout(), "(empty directory)")
				return nil
			}
			fmt.Fprintln(cmd.OutOrStdout(), formatTree(nodes, ""))
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		ops, err := services.Registry.GetFileOperations(ctx, registry.FileOperationFilter{})
		if err != nil {
			return err
		}

		if len(ops) == 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "No files currently managed")
			return nil
		}

		for _, op := range ops {
			fmt.Fprintf(cmd.OutOrStdout(), "- %s (%s): %s\n", op.ToolName, op.FileType, op.FilePath)
		}
		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(filesCmd)
}
