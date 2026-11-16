package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var toolDevUseCmd = &cobra.Command{
	Use:               "use <tool>",
	Args:              cobra.ExactArgs(1),
	Short:             "Copy and activate local binaries for a configured tool",
	ValidArgsFunction: completeToolName,
	Example:           "  dotfiles tool dev use just --bin just=./target/release/just --source-repo .\n  dotfiles tool dev use suite --bin foo=./foo --bin bar=./bar --version dev.42",
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()
		tool, err := findDevTool(services, args[0])
		if err != nil {
			return err
		}
		entries, _ := cmd.Flags().GetStringArray("bin")
		binaries, err := devBinaryMappings(tool, entries, services.ProjectConfig.Paths.HomeDir)
		if err != nil {
			return err
		}
		sourceRepo, _ := cmd.Flags().GetString("source-repo")
		if sourceRepo != "" {
			sourceRepo, err = filepath.Abs(utils.ExpandHomePath(services.ProjectConfig.Paths.HomeDir, sourceRepo))
			if err != nil {
				return fmt.Errorf("resolving source repository: %w", err)
			}
		}
		version, _ := cmd.Flags().GetString("version")
		log := GetLogger("dev", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		if err := changeDevTool(cmd.Context(), services, tool, func(ctx context.Context, store *devtools.Store) error {
			_, err := store.Use(ctx, tool.Name, devtools.UseOptions{Binaries: binaries, Version: version, SourceRepo: sourceRepo})
			return err
		}); err != nil {
			return err
		}
		message := "Development build active; release updates and cleanup preserve it"
		if dryRun {
			message = "[dry-run] Would activate development build"
		}
		log.WithTag(tool.Name).Info(logger.Message(message))
		return nil
	},
}

func devBinaryMappings(tool *config.ToolConfig, entries []string, home string) (map[string]string, error) {
	declared := tool.BinaryNames()
	if len(declared) == 0 {
		return nil, fmt.Errorf("tool %q declares no binaries; add .bin() before activating a development build", tool.Name)
	}
	binaries := make(map[string]string, len(entries))
	for _, entry := range entries {
		name, source, ok := strings.Cut(entry, "=")
		if !ok || name == "" || source == "" {
			return nil, fmt.Errorf("invalid --bin %q: expected name=source", entry)
		}
		if _, exists := binaries[name]; exists {
			return nil, fmt.Errorf("duplicate --bin mapping for %q", name)
		}
		path, err := filepath.Abs(utils.ExpandHomePath(home, source))
		if err != nil {
			return nil, fmt.Errorf("resolving binary %q: %w", name, err)
		}
		binaries[name] = path
	}
	for _, name := range declared {
		if _, ok := binaries[name]; !ok {
			return nil, fmt.Errorf("missing --bin mapping for declared binary %q", name)
		}
	}
	if len(binaries) != len(declared) {
		return nil, fmt.Errorf("--bin mappings must match the binaries declared by tool %q", tool.Name)
	}
	return binaries, nil
}

func init() {
	toolDevUseCmd.Flags().StringArray("bin", nil, "Declared binary name and local source path (name=source; repeat for every binary)")
	toolDevUseCmd.Flags().String("source-repo", "", "Source repository path to record")
	toolDevUseCmd.Flags().String("version", "", "Development build version to record")
}
