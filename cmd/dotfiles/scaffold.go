package main

import (
	"fmt"
	"path/filepath"
	"runtime"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/scaffold"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
	"github.com/spf13/cobra"
)

var scaffoldForce bool

var scaffoldCmd = &cobra.Command{
	Use:   "scaffold",
	Short: "Create starter tool configurations in the tool configs directory",
	Long: `Creates the starter .tool.ts files a dotfiles repository is expected to have in
the primary tool configs directory, creating that directory if it does not exist.

Existing files are left untouched unless --force is passed.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		dirs := vm.ResolveToolConfigsDirs(services.FS, services.ProjectConfig, filepath.Dir(services.ConfigPath))
		if len(dirs) == 0 {
			return fmt.Errorf("no tool configs directory is configured")
		}

		results, err := scaffold.Run(services.FS, scaffold.Options{
			Dir:      dirs[0],
			TargetOS: runtime.GOOS,
			Force:    scaffoldForce,
		})
		if err != nil {
			return err
		}

		// Under --dry-run the filesystem is in-memory, so report what would happen
		// rather than claiming files were written.
		created, overwrote := "Created", "Overwrote"
		if dryRun {
			created, overwrote = "Would create", "Would overwrite"
		}

		log := GetLogger("scaffold", cmd.ErrOrStderr())
		for _, res := range results {
			switch res.Action {
			case scaffold.ActionCreated:
				log.Info(logger.Message(fmt.Sprintf("%s %s", created, res.Path)))
			case scaffold.ActionOverwrote:
				log.Info(logger.Message(fmt.Sprintf("%s %s", overwrote, res.Path)))
			case scaffold.ActionSkipped:
				log.Info(logger.Message(fmt.Sprintf("%s already exists, skipping", res.Path)))
			case scaffold.ActionOutdated:
				log.Warn(logger.Message(fmt.Sprintf("%s is an older generated version; run \"dotfiles scaffold --force\" to update it", res.Path)))
			}
			if res.BackupPath != "" {
				log.Info(logger.Message(fmt.Sprintf("Saved your previous %s to %s", filepath.Base(res.Path), res.BackupPath)))
			}
		}

		return nil
	},
}

func init() {
	scaffoldCmd.Flags().BoolVar(&scaffoldForce, "force", false, "Overwrite tool configurations that already exist")
	rootCmd.AddCommand(scaffoldCmd)
}
