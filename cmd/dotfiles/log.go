package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
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
	logJSON      bool
)

type FileStateInfo struct {
	ToolName   string `json:"tool"`
	FilePath   string `json:"filePath"`
	FileType   string `json:"fileType"`
	Exists     bool   `json:"exists"`
	SizeBytes  *int64 `json:"sizeBytes,omitempty"`
	TargetPath string `json:"targetPath,omitempty"`
}

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

			allStates := []FileStateInfo{}

			for _, toolName := range tools {
				fileStates, err := services.Registry.GetFileStatesForTool(ctx, toolName)
				if err != nil || len(fileStates) == 0 {
					continue
				}

				for _, state := range fileStates {
					exists, _ := services.FS.Exists(state.FilePath)
					targetPath := ""
					if state.TargetPath != nil {
						targetPath = *state.TargetPath
					}
					info := FileStateInfo{
						ToolName:   toolName,
						FilePath:   state.FilePath,
						FileType:   state.FileType,
						Exists:     exists,
						SizeBytes:  state.SizeBytes,
						TargetPath: targetPath,
					}
					allStates = append(allStates, info)
				}
			}

			if logJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), allStates)
			}

			if cliout.IsAgentMode() {
				for _, state := range allStates {
					sizeVal := int64(0)
					if state.SizeBytes != nil {
						sizeVal = *state.SizeBytes
					}
					fmt.Fprintf(cmd.OutOrStdout(), "tool:%s path:%s type:%s exists:%t size:%d target:%s\n", state.ToolName, state.FilePath, state.FileType, state.Exists, sizeVal, state.TargetPath)
				}
				return nil
			}

			currentTool := ""
			for _, state := range allStates {
				if state.ToolName != currentTool {
					currentTool = state.ToolName
					fmt.Fprintf(cmd.OutOrStdout(), "File states for %s:\n", currentTool)
				}
				statusTag := "[OK]"
				statusText := "exists"
				if !state.Exists {
					statusTag = "[MISSING]"
					statusText = "MISSING"
				}
				sizeText := ""
				if state.SizeBytes != nil && *state.SizeBytes > 0 {
					sizeText = fmt.Sprintf(" (%d bytes)", *state.SizeBytes)
				}
				fmt.Fprintf(cmd.OutOrStdout(), "  %s %s [%s] - %s%s\n", statusTag, state.FilePath, state.FileType, statusText, sizeText)
				if state.TargetPath != "" {
					targetTag := "->"
					if exists, _ := services.FS.Exists(state.TargetPath); !exists {
						targetTag = "[MISSING ->]"
					}
					fmt.Fprintf(cmd.OutOrStdout(), "    %s %s\n", targetTag, state.TargetPath)
				}
			}
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
			if logJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), ops)
			}
			for _, op := range ops {
				contractedPath := utils.ContractHomePath(services.ProjectConfig.Paths.HomeDir, op.FilePath)
				tm := time.UnixMilli(op.CreatedAt).Format("2006-01-02 15:04:05")
				if cliout.IsAgentMode() {
					fmt.Fprintf(cmd.OutOrStdout(), "time:%s tool:%s op:%s path:%s type:%s\n", tm, op.ToolName, op.OperationType, contractedPath, op.FileType)
				} else {
					fmt.Fprintf(cmd.OutOrStdout(), "[%s] [%s] %s %s (%s)\n", tm, op.ToolName, op.OperationType, contractedPath, op.FileType)
				}
			}
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
			if logJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), []any{})
			}
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

		if logJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), lines[start:])
		}

		for i := start; i < len(lines); i++ {
			fmt.Fprintln(cmd.OutOrStdout(), lines[i])
		}

		return nil
	},
}

func init() {
	logCmd.Flags().IntVarP(&logTailLines, "tail", "n", 50, "Number of lines to output from the tail of the log")
	logCmd.Flags().StringVar(&logType, "type", "", "Filter by file type (shim, binary, symlink, copy, config, completion, etc.)")
	logCmd.Flags().BoolVar(&logStatus, "status", false, "Show current file states for tools")
	logCmd.Flags().StringVar(&logSince, "since", "", "Show operations created since date (YYYY-MM-DD)")
	logCmd.Flags().BoolVar(&logJSON, "json", false, "Output results in JSON format")
	rootCmd.AddCommand(logCmd)
}
