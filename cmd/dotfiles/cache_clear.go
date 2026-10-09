package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var cacheClearCmd = &cobra.Command{
	Use:   "clear",
	Args:  cobra.NoArgs,
	Short: "Remove cached downloads for versions no longer installed",
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()
		log := GetLogger("cache", cmd.ErrOrStderr())
		if config.IsDryRunEnabled(cmd.Context()) {
			log.Info("Dry run: download cache cleanup skipped")
			return nil
		}
		result, err := services.Orchestrator.ClearDownloadCache(cmd.Context(), services.ProjectConfig)
		if err != nil {
			return err
		}
		log.Info(logger.Message(fmt.Sprintf("Removed %d old cached downloads (%d bytes)", result.Entries, result.Bytes)))
		if result.Untracked > 0 {
			log.Warn(logger.Message(fmt.Sprintf("Preserved %d cached downloads without installed-version ownership", result.Untracked)))
		}
		return nil
	},
}
