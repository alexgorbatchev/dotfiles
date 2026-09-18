package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var (
	generateReadme bool
	featuresJSON   bool
)

// generateReadmeArg is the one positional word `features` accepts, as an
// alternative spelling of --generate-readme.
const generateReadmeArg = "generate-readme"

// featuresReport is what `dotfiles features` reports: the feature flags the binary
// acts on. features.catalog is still accepted and validated by the configuration
// loader, but no code generates a catalog, so reporting it here would announce a
// capability that does not exist.
type featuresReport struct {
	ShellInstall bool `json:"shellInstall"`
}

var featuresCmd = &cobra.Command{
	Use:       "features [" + generateReadmeArg + "]",
	Short:     "Feature flag management and readme generator",
	Args:      cobra.MatchAll(cobra.MaximumNArgs(1), cobra.OnlyValidArgs),
	ValidArgs: []cobra.Completion{generateReadmeArg},
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("features", cmd.ErrOrStderr())

		// Args validation guarantees that a positional word, when present, is generateReadmeArg.
		if generateReadme || len(args) > 0 {
			log.Info("Generating readme documentation for configured tools...")
			var markdown string
			markdown += "# Configured Tools & Features\n\n"
			markdown += "| Tool | Method | Binaries | Description |\n"
			markdown += "| :--- | :--- | :--- | :--- |\n"

			for _, tc := range services.ToolConfigs {
				method := tc.InstallationMethod
				if method == "" {
					method = "shell"
				}
				binStr := tc.Name
				if len(tc.Binaries) > 0 {
					var bNames []string
					for _, b := range tc.Binaries {
						if v, ok := b.(map[string]interface{}); ok {
							if name, ok := v["name"].(string); ok {
								bNames = append(bNames, name)
							}
						}
					}
					if len(bNames) > 0 {
						binStr = fmt.Sprintf("`%s`", fmt.Sprintf("%v", bNames))
					}
				}
				markdown += fmt.Sprintf("| **%s** | %s | %s | Managed via dotfiles |\n", tc.Name, method, binStr)
			}

			fmt.Fprintln(cmd.OutOrStdout(), markdown)
			return nil
		}

		report := featuresReport{ShellInstall: services.ProjectConfig.Features.ShellInstall != nil}
		if featuresJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), report)
		}

		log.Info(logger.Message("Configured feature flags:"))
		if cliout.IsAgentMode() {
			fmt.Fprintf(cmd.OutOrStdout(), "shellInstall:%v\n", report.ShellInstall)
		} else {
			fmt.Fprintf(cmd.OutOrStdout(), "ShellInstall: %v\n", report.ShellInstall)
		}

		return nil
	},
}

func init() {
	featuresCmd.Flags().BoolVar(&generateReadme, "generate-readme", false, "Generate markdown documentation for tools and features")
	featuresCmd.Flags().BoolVar(&featuresJSON, "json", false, "Output feature flags in JSON format")
	rootCmd.AddCommand(featuresCmd)
}
