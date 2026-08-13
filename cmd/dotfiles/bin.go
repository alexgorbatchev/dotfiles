package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var listBins bool

var binCmd = &cobra.Command{
	Use:   "bin [name]",
	Short: "Outputs target bin directory, lists configured binaries, or resolves a binary path",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("bin", cmd.ErrOrStderr())
		log.Info("Resolving binary path and configuration...")

		if listBins {
			var allBins []string
			for _, tc := range services.ToolConfigs {
				bins := installer.GetBinaryNames(tc.Name, tc.Binaries)
				for _, b := range bins {
					allBins = append(allBins, fmt.Sprintf("%s (%s)", b, tc.Name))
				}
			}
			log.Info(logger.Message(fmt.Sprintf("Configured binaries (%d):", len(allBins))))
			for _, b := range allBins {
				log.Info(logger.Message("  " + b))
			}
			log.Info(logger.Messages.CommandCompleted(dryRun))
			fmt.Fprintln(cmd.OutOrStdout(), strings.Join(allBins, "\n"))
		} else if len(args) > 0 {
			name := args[0]
			var targetTool *config.ToolConfig
			var targetBin string
			for _, tc := range services.ToolConfigs {
				if tc.Name == name {
					targetTool = tc
					bins := installer.GetBinaryNames(tc.Name, tc.Binaries)
					if len(bins) > 0 {
						targetBin = bins[0]
					} else {
						targetBin = tc.Name
					}
					break
				}
				bins := installer.GetBinaryNames(tc.Name, tc.Binaries)
				for _, b := range bins {
					if b == name {
						targetTool = tc
						targetBin = name
						break
					}
				}
				if targetTool != nil {
					break
				}
			}
			if targetTool == nil {
				return fmt.Errorf("binary or tool not found: %s", name)
			}
			binPath := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current", targetBin)
			realPath, err := filepath.EvalSymlinks(binPath)
			if err != nil {
				realPath = binPath
			}
			if exists, _ := fileExists(realPath); !exists {
				return fmt.Errorf("binary path does not exist: %s", binPath)
			}
			fmt.Print(realPath)
			return nil
		} else {
			binDir := services.ProjectConfig.Paths.BinariesDir
			if binDir == "" {
				binDir = services.ProjectConfig.Paths.TargetDir
			}
			log.Info(logger.Message(fmt.Sprintf("Target bin directory: %s", binDir)))
			log.Info(logger.Messages.CommandCompleted(dryRun))
			fmt.Fprintln(cmd.OutOrStdout(), binDir)
		}

		return nil
	},
}

func init() {
	binCmd.Flags().BoolVarP(&listBins, "list", "l", false, "List all configured binaries and their tool names")
	rootCmd.AddCommand(binCmd)
}
