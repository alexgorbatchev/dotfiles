package main

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/github"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var toolAddForce bool

var toolAddCmd = &cobra.Command{
	Use:   "add <owner/repo>",
	Args:  cobra.ExactArgs(1),
	Short: "Add a remote tool configuration from a GitHub repository",
	Long: `Fetches <name>.tool.ts from the specified GitHub repository and writes it
into the primary tool configs directory.

The tool name is derived from the repository name (e.g. sharkdp/bat -> bat.tool.ts).
If the configuration already exists locally, --force is required to overwrite it.`,
	ValidArgsFunction: completeNoFileComp,
	RunE: func(cmd *cobra.Command, args []string) error {
		rawArg := strings.TrimSpace(args[0])
		repoArg := rawArg
		repoArg = strings.TrimPrefix(repoArg, "https://github.com/")
		repoArg = strings.TrimPrefix(repoArg, "http://github.com/")
		repoArg = strings.TrimPrefix(repoArg, "github.com/")
		repoArg = strings.TrimSuffix(repoArg, ".git")
		repoArg = strings.TrimSuffix(repoArg, "/")

		parts := strings.Split(repoArg, "/")
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" || strings.ContainsAny(parts[0], " \t\r\n") || strings.ContainsAny(parts[1], " \t\r\n") {
			return fmt.Errorf("invalid repository %q: expected owner/repo", rawArg)
		}

		owner := parts[0]
		repo := strings.TrimSuffix(parts[1], ".tool.ts")
		if repo == "" {
			return fmt.Errorf("invalid repository %q: repository name cannot be empty", rawArg)
		}
		toolName := repo
		fileName := toolName + ".tool.ts"
		repoSlug := owner + "/" + repo

		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		dirs := services.ProjectConfig.Paths.GetToolConfigsDirs()
		if len(dirs) == 0 {
			return fmt.Errorf("no tool configs directory is configured")
		}

		targetPath := filepath.Join(dirs[0], fileName)

		exists, _ := services.FS.Exists(targetPath)
		if exists && !toolAddForce {
			return fmt.Errorf("%s already exists (use --force to overwrite)", targetPath)
		}

		content, err := github.FetchContent(cmd.Context(), repoSlug, fileName, github.ContentOptions{
			Host:       services.ProjectConfig.Github.Host,
			Token:      services.ProjectConfig.Github.Token,
			UserAgent:  services.ProjectConfig.Github.UserAgent,
			HTTPClient: services.HTTPClient,
			Runner:     services.Runner,
		})
		if err != nil {
			if errors.Is(err, github.ErrNotFound) {
				return fmt.Errorf("tool definition %s not found in %s", fileName, repoSlug)
			}
			return fmt.Errorf("fetching tool definition from %s: %w", repoSlug, err)
		}

		log := GetLogger("add", cmd.ErrOrStderr())

		if dryRun {
			action := "Would create"
			if exists {
				action = "Would overwrite"
			}
			log.Info(logger.Message(fmt.Sprintf("%s %s", action, targetPath)))
			return nil
		}

		if err := services.FS.MkdirAll(dirs[0], 0755); err != nil {
			return fmt.Errorf("creating tool configs directory: %w", err)
		}

		if err := services.FS.WriteFile(targetPath, content, 0644); err != nil {
			return fmt.Errorf("writing tool config %s: %w", targetPath, err)
		}

		action := "Created"
		if exists {
			action = "Overwrote"
		}
		log.Info(logger.Message(fmt.Sprintf("%s %s", action, targetPath)))
		return nil
	},
}

func init() {
	toolAddCmd.Flags().BoolVarP(&toolAddForce, "force", "f", false, "Overwrite existing tool configuration")
}
