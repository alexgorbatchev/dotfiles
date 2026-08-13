package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var generateReadme bool

var featuresCmd = &cobra.Command{
	Use:   "features",
	Short: "Feature flag management and readme generator",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("features", cmd.ErrOrStderr())

		if generateReadme || (len(args) > 0 && args[0] == "generate-readme") {
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
						switch v := b.(type) {
						case string:
							bNames = append(bNames, v)
						case map[string]interface{}:
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
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		log.Info(logger.Message("Configured feature flags:"))
		feat := services.ProjectConfig.Features
		fmt.Fprintf(cmd.OutOrStdout(), "Catalog Generate: %v\n", feat.Catalog.Generate)
		fmt.Fprintf(cmd.OutOrStdout(), "ShellInstall: %v\n", feat.ShellInstall != nil)

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	featuresCmd.Flags().BoolVar(&generateReadme, "generate-readme", false, "Generate markdown documentation for tools and features")
	rootCmd.AddCommand(featuresCmd)
}
