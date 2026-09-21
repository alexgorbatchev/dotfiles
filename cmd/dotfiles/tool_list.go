package main

import (
	"fmt"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/spf13/cobra"
)

var toolListJSON bool

type ToolListItem struct {
	Name      string   `json:"name"`
	Installed bool     `json:"installed"`
	Version   string   `json:"version,omitempty"`
	Method    string   `json:"method"`
	Binaries  []string `json:"binaries"`
	Disabled  bool     `json:"disabled,omitempty"`
}

var toolListCmd = &cobra.Command{
	Use:   "list",
	Args:  cobra.NoArgs,
	Short: "List configured tools (status, installer, binaries)",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		var items []ToolListItem
		for _, tc := range services.ToolConfigs {
			method := tc.InstallationMethod
			if method == "" {
				method = "shell"
			}
			regTool, _ := services.Registry.GetToolInstallation(ctx, tc.Name)
			installed := regTool != nil
			version := ""
			if tc.Version != nil {
				version = *tc.Version
			}
			if regTool != nil && regTool.Version != "" {
				version = regTool.Version
			}
			bins := installer.GetBinaryNames(tc.Name, tc.Binaries)

			items = append(items, ToolListItem{
				Name:      tc.Name,
				Installed: installed,
				Version:   version,
				Method:    method,
				Binaries:  bins,
				Disabled:  tc.Disabled,
			})
		}

		slices.SortFunc(items, func(a, b ToolListItem) int {
			if a.Name < b.Name {
				return -1
			}
			if a.Name > b.Name {
				return 1
			}
			return 0
		})

		if toolListJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), items)
		}

		if len(items) == 0 {
			if cliout.IsAgentMode() {
				fmt.Fprintln(cmd.OutOrStdout(), "no tools configured")
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "No tools configured.")
			}
			return nil
		}

		if cliout.IsAgentMode() {
			for _, item := range items {
				fmt.Fprintf(cmd.OutOrStdout(), "name:%s installed:%t method:%s binaries:%s version:%s\n",
					item.Name, item.Installed, item.Method, strings.Join(item.Binaries, ","), item.Version)
			}
		} else {
			for _, item := range items {
				status := "[not installed]"
				if item.Installed {
					status = "[installed]"
				}
				if item.Disabled {
					status = "[disabled]"
				}
				binStr := strings.Join(item.Binaries, ", ")
				if binStr == "" {
					binStr = "-"
				}
				verStr := item.Version
				if verStr == "" {
					verStr = "-"
				}
				fmt.Fprintf(cmd.OutOrStdout(), "• %-20s %-15s method:%-14s binaries:%-15s version:%s\n",
					item.Name, status, item.Method, binStr, verStr)
			}
		}

		return nil
	},
}

func init() {
	toolListCmd.Flags().BoolVar(&toolListJSON, "json", false, "Output in JSON format")
}
