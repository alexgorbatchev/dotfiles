package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var (
	listBins bool
	binJSON  bool
)

type BinaryInfo struct {
	Binary string `json:"binary"`
	Tool   string `json:"tool"`
}

var binCmd = &cobra.Command{
	Use:               "bin [name]",
	Args:              cobra.MaximumNArgs(1),
	Short:             "Outputs target bin directory, lists configured binaries, or resolves a binary path",
	ValidArgsFunction: completeBinaryOrToolName,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("bin", cmd.ErrOrStderr())
		log.Info("Resolving binary path and configuration...")

		if listBins {
			var allBins []string
			binInfos := []BinaryInfo{}
			for _, tc := range services.ToolConfigs {
				bins := installer.GetBinaryNames(tc.Name, tc.Binaries)
				for _, b := range bins {
					allBins = append(allBins, fmt.Sprintf("%s (%s)", b, tc.Name))
					binInfos = append(binInfos, BinaryInfo{
						Binary: b,
						Tool:   tc.Name,
					})
				}
			}
			log.Info(logger.Message(fmt.Sprintf("Configured binaries (%d):", len(allBins))))
			for _, b := range allBins {
				log.Info(logger.Message("  " + b))
			}
			if binJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), binInfos)
			}
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
			if binJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), map[string]string{
					"name":   name,
					"tool":   targetTool.Name,
					"binary": targetBin,
					"path":   realPath,
				})
			}
			fmt.Fprint(cmd.OutOrStdout(), realPath)
			return nil
		} else {
			binDir := services.ProjectConfig.Paths.TargetDir
			log.Info(logger.Message(fmt.Sprintf("Target bin directory: %s", binDir)))
			if binJSON {
				return cliout.RenderJSON(cmd.OutOrStdout(), map[string]string{
					"binDir": binDir,
				})
			}
			fmt.Fprintln(cmd.OutOrStdout(), binDir)
		}

		return nil
	},
}

func init() {
	binCmd.Flags().BoolVarP(&listBins, "list", "l", false, "List all configured binaries and their tool names")
	binCmd.Flags().BoolVar(&binJSON, "json", false, "Output results in JSON format")
	rootCmd.AddCommand(binCmd)
}
