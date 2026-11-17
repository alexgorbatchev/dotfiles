package main

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
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
		devStore := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir)
		if targetTool == nil && toolWhichBin {
			dev, err := devStore.Lookup(query)
			if err != nil {
				return err
			}
			if dev != nil {
				targetTool = &config.ToolConfig{Name: dev.Tool}
				names := make([]string, 0, len(dev.Binaries))
				for name := range dev.Binaries {
					names = append(names, name)
				}
				sort.Strings(names)
				for _, name := range names {
					targetTool.Binaries = append(targetTool.Binaries, config.BinaryConfig{Name: name})
				}
			}
		}
		if targetTool == nil {
			return fmt.Errorf("tool or binary %q not found", query)
		}

		if toolWhichBin {
			bins := targetTool.BinaryNames()
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
			dev, err := devStore.Lookup(targetTool.Name)
			if err != nil {
				return err
			}
			realPath := binPath
			if dev != nil {
				if err := devStore.Validate(dev); err != nil {
					return err
				}
				realPath = dev.Binaries[targetBin]
				if realPath == "" {
					return fmt.Errorf("development override for %s has no binary %s; register the build again", targetTool.Name, targetBin)
				}
			} else {
				if resolved, err := filepath.EvalSymlinks(binPath); err == nil {
					realPath = resolved
				}
				if exists, _ := fileExists(realPath); !exists {
					return fmt.Errorf("binary path does not exist: %s", binPath)
				}
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

		// The loader records the .tool.ts file every tool was read from.
		cfgPath := targetTool.ConfigFilePath

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
