package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var (
	logTailLines int
	logType      string
	logStatus    bool
	logSince     string
)

var logCmd = &cobra.Command{
	Use:   "log [tool]",
	Short: "Display or tail log output and file registry operation history",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("log", cmd.ErrOrStderr())
		log.Info("Reading operation history and logs...")

		var toolFilter string
		if len(args) > 0 {
			toolFilter = args[0]
		}

		if logStatus {
			tools := []string{}
			if toolFilter != "" {
				tools = append(tools, toolFilter)
			} else {
				registered, err := services.Registry.GetRegisteredTools(ctx)
				if err == nil {
					tools = registered
				}
			}

			for _, toolName := range tools {
				fileStates, err := services.Registry.GetFileStatesForTool(ctx, toolName)
				if err != nil || len(fileStates) == 0 {
					continue
				}
				fmt.Fprintf(cmd.OutOrStdout(), "File states for %s:\n", toolName)
				for _, state := range fileStates {
					exists, _ := services.FS.Exists(state.FilePath)
					statusIcon := "✓"
					statusText := "exists"
					if !exists {
						statusIcon = "✗"
						statusText = "MISSING"
					}
					sizeText := ""
					if state.SizeBytes != nil && *state.SizeBytes > 0 {
						sizeText = fmt.Sprintf(" (%d bytes)", *state.SizeBytes)
					}
					fmt.Fprintf(cmd.OutOrStdout(), "  %s %s [%s] - %s%s\n", statusIcon, state.FilePath, state.FileType, statusText, sizeText)
					if state.TargetPath != nil && *state.TargetPath != "" {
						targetExists, _ := services.FS.Exists(*state.TargetPath)
						targetIcon := "→"
						if !targetExists {
							targetIcon = "✗"
						}
						fmt.Fprintf(cmd.OutOrStdout(), "    %s %s\n", targetIcon, *state.TargetPath)
					}
				}
			}
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		filter := registry.FileOperationFilter{
			ToolName: toolFilter,
			FileType: logType,
		}

		if logSince != "" {
			t, err := time.Parse("2006-01-02", logSince)
			if err == nil {
				filter.CreatedAfter = t.UnixMilli()
			}
		}

		ops, err := services.Registry.GetFileOperations(ctx, filter)
		if err == nil && len(ops) > 0 {
			for _, op := range ops {
				contractedPath := utils.ContractHomePath(services.ProjectConfig.Paths.HomeDir, op.FilePath)
				tm := time.UnixMilli(op.CreatedAt).Format("2006-01-02 15:04:05")
				fmt.Fprintf(cmd.OutOrStdout(), "[%s] [%s] %s %s (%s)\n", tm, op.ToolName, op.OperationType, contractedPath, op.FileType)
			}
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		// Fallback to disk logs if no DB operations found or --tail explicitly used
		logCandidates := []string{
			filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "usage", "shim-usage.log"),
			filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "dotfiles.log"),
		}

		var foundPath string
		for _, cand := range logCandidates {
			if exists, _ := fileExists(cand); exists {
				foundPath = cand
				break
			}
		}

		if foundPath == "" {
			log.Info("No log entries found.")
			log.Info(logger.Messages.CommandCompleted(dryRun))
			fmt.Fprintln(cmd.OutOrStdout(), "No log entries found.")
			return nil
		}

		log.Info(logger.Message(fmt.Sprintf("Reading log file: %s", foundPath)))
		content, err := os.ReadFile(foundPath)
		if err != nil {
			return fmt.Errorf("reading log file %s: %w", foundPath, err)
		}

		lines := strings.Split(string(content), "\n")
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}

		start := 0
		if logTailLines > 0 && len(lines) > logTailLines {
			start = len(lines) - logTailLines
		}

		for i := start; i < len(lines); i++ {
			fmt.Fprintln(cmd.OutOrStdout(), lines[i])
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	logCmd.Flags().IntVarP(&logTailLines, "tail", "n", 50, "Number of lines to output from the tail of the log")
	logCmd.Flags().StringVar(&logType, "type", "", "Filter by file type (shim, binary, symlink, copy, config, completion, etc.)")
	logCmd.Flags().BoolVar(&logStatus, "status", false, "Show current file states for tools")
	logCmd.Flags().StringVar(&logSince, "since", "", "Show operations created since date (YYYY-MM-DD)")
	rootCmd.AddCommand(logCmd)
}
