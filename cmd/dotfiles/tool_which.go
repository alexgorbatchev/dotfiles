package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/spf13/cobra"
)

var (
	toolWhichBin  bool
	toolWhichJSON bool
)

var toolWhichCmd = &cobra.Command{
	Use:               "which <name>",
	Short:             "Locate a tool or binary (.tool.ts path or payload binary)",
	Args:              cobra.ExactArgs(1),
	ValidArgsFunction: completeBinaryOrToolName,
	SilenceUsage:      true,
	SilenceErrors:     true,
	RunE: func(cmd *cobra.Command, args []string) error {
		query := args[0]
		logLevel = "quiet"

		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return fmt.Errorf("bootstrap services: %w", err)
		}
		defer services.Close()

		targetTool := config.FindTool(services.ToolConfigs, query)
		if targetTool == nil {
			return fmt.Errorf("tool or binary %q not found", query)
		}

		if toolWhichBin {
			bins := installer.GetBinaryNames(targetTool.Name, targetTool.Binaries)
			targetBin := targetTool.Name
			if len(bins) > 0 {
				targetBin = bins[0]
				for _, b := range bins {
					if b == query {
						targetBin = b
						break
					}
				}
			}

			binPath := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current", targetBin)
			realPath, err := filepath.EvalSymlinks(binPath)
			if err != nil {
				realPath = binPath
			}
			if exists, _ := fileExists(realPath); !exists {
				return fmt.Errorf("binary path does not exist: %s", binPath)
			}

			if toolWhichJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), map[string]string{
					"name":   query,
					"tool":   targetTool.Name,
					"binary": targetBin,
					"path":   realPath,
				})
			}
			fmt.Fprintln(cmd.OutOrStdout(), realPath)
			return nil
		}

		cfgPath := targetTool.ConfigFilePath
		if cfgPath == "" {
			cfgPath = services.ConfigPath
		}
		if cfgPath == "" {
			return fmt.Errorf("tool %q has no config file path", query)
		}

		if exists, _ := fileExists(cfgPath); !exists {
			return fmt.Errorf("config file for %q does not exist: %s", query, cfgPath)
		}

		if toolWhichJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), map[string]string{
				"name":       query,
				"tool":       targetTool.Name,
				"configPath": cfgPath,
			})
		}

		fmt.Fprintln(cmd.OutOrStdout(), cfgPath)
		return nil
	},
}

func init() {
	toolWhichCmd.Flags().BoolVar(&toolWhichBin, "bin", false, "Output the path to the installed binary executable instead of the configuration file")
	toolWhichCmd.Flags().BoolVar(&toolWhichJSON, "json", false, "Output result in JSON format")
}
