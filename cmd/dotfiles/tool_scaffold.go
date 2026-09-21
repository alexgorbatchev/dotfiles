package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/scaffold"
	"github.com/spf13/cobra"
)

var toolScaffoldForce bool

var toolScaffoldCmd = &cobra.Command{
	Use:   "scaffold [name]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Create a starter .tool.ts configuration file",
	Long: `Creates starter .tool.ts files in the primary tool configs directory, creating that
directory if it does not exist.

When a name is specified, generates a new <name>.tool.ts starter configuration.
Existing files are left untouched unless --force is passed.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		dirs := services.ProjectConfig.Paths.GetToolConfigsDirs()
		if len(dirs) == 0 {
			return fmt.Errorf("no tool configs directory is configured")
		}

		targetOS := services.Target.OS
		if targetOS == "" {
			targetOS = runtime.GOOS
		}

		log := GetLogger("scaffold", cmd.ErrOrStderr())

		if len(args) > 0 {
			toolName := args[0]
			fileName := toolName
			if !strings.HasSuffix(fileName, ".tool.ts") && !strings.HasSuffix(fileName, ".ts") {
				fileName += ".tool.ts"
			}
			targetPath := filepath.Join(dirs[0], fileName)

			exists, _ := services.FS.Exists(targetPath)
			if exists && !toolScaffoldForce {
				log.Info(logger.Message(fmt.Sprintf("%s already exists, skipping (use --force to overwrite)", targetPath)))
				return nil
			}

			if err := services.FS.MkdirAll(dirs[0], 0755); err != nil {
				return fmt.Errorf("creating tool configs directory: %w", err)
			}

			content := fmt.Sprintf(`import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "owner/%s" })
    .bin("%s"),
);
`, toolName, toolName)

			if dryRun {
				log.Info(logger.Message(fmt.Sprintf("Would create %s", targetPath)))
				return nil
			}

			if err := services.FS.WriteFile(targetPath, []byte(content), 0644); err != nil {
				return fmt.Errorf("writing tool config %s: %w", targetPath, err)
			}
			log.Info(logger.Message(fmt.Sprintf("Created %s", targetPath)))
			return nil
		}

		results, err := scaffold.Run(services.FS, scaffold.Options{
			Dir:      dirs[0],
			TargetOS: targetOS,
			Force:    toolScaffoldForce,
		})
		if err != nil {
			return err
		}

		created, overwrote := "Created", "Overwrote"
		if dryRun {
			created, overwrote = "Would create", "Would overwrite"
		}

		for _, res := range results {
			switch res.Action {
			case scaffold.ActionCreated:
				log.Info(logger.Message(fmt.Sprintf("%s %s", created, res.Path)))
			case scaffold.ActionOverwrote:
				log.Info(logger.Message(fmt.Sprintf("%s %s", overwrote, res.Path)))
			case scaffold.ActionSkipped:
				log.Info(logger.Message(fmt.Sprintf("%s already exists, skipping", res.Path)))
			case scaffold.ActionOutdated:
				log.Warn(logger.Message(fmt.Sprintf("%s is an older generated version; run \"dotfiles tool scaffold --force\" to update it", res.Path)))
			}
			if res.BackupPath != "" {
				log.Info(logger.Message(fmt.Sprintf("Saved your previous %s to %s", filepath.Base(res.Path), res.BackupPath)))
			}
		}

		return nil
	},
}

func init() {
	toolScaffoldCmd.Flags().BoolVarP(&toolScaffoldForce, "force", "f", false, "Overwrite tool configurations that already exist")
}
