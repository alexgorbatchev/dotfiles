package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var (
	logTailLines int
)

var logCmd = &cobra.Command{
	Use:   "log",
	Short: "Display or tail log output",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("log", cmd.ErrOrStderr())

		// Candidate log paths
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

		return nil
	},
}

func init() {
	logCmd.Flags().IntVarP(&logTailLines, "tail", "n", 50, "Number of lines to output from the tail of the log")
	rootCmd.AddCommand(logCmd)
}
