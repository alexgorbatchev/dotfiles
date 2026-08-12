package main

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var listBins bool

var binCmd = &cobra.Command{
	Use:   "bin",
	Short: "Outputs target bin directory or lists configured binaries",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("bin", cmd.ErrOrStderr())

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
			fmt.Fprintln(cmd.OutOrStdout(), strings.Join(allBins, "\n"))
		} else {
			binDir := services.ProjectConfig.Paths.BinariesDir
			if binDir == "" {
				binDir = services.ProjectConfig.Paths.TargetDir
			}
			log.Info(logger.Message(fmt.Sprintf("Target bin directory: %s", binDir)))
			fmt.Fprintln(cmd.OutOrStdout(), binDir)
		}

		return nil
	},
}

func init() {
	binCmd.Flags().BoolVarP(&listBins, "list", "l", false, "List all configured binaries and their tool names")
	rootCmd.AddCommand(binCmd)
}
