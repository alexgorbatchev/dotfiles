package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/spf13/cobra"
)

var toolInfoJSON bool

type BinaryLocationInfo struct {
	Name        string `json:"name"`
	ShimPath    string `json:"shimPath"`
	PayloadPath string `json:"payloadPath"`
	Exists      bool   `json:"exists"`
}

type ToolInfoReport struct {
	Name               string               `json:"name"`
	ConfigFilePath     string               `json:"configFilePath"`
	InstallationMethod string               `json:"installationMethod"`
	ConfiguredVersion  string               `json:"configuredVersion,omitempty"`
	Installed          bool                 `json:"installed"`
	InstalledVersion   string               `json:"installedVersion,omitempty"`
	InstallPath        string               `json:"installPath,omitempty"`
	Disabled           bool                 `json:"disabled,omitempty"`
	Dependencies       []string             `json:"dependencies,omitempty"`
	Binaries           []BinaryLocationInfo `json:"binaries"`
	SymlinksCount      int                  `json:"symlinksCount"`
	CopiesCount        int                  `json:"copiesCount"`
	BlocksCount        int                  `json:"blocksCount"`
	TemplatesCount     int                  `json:"templatesCount"`
}

var toolInfoCmd = &cobra.Command{
	Use:               "info <tool>",
	Args:              cobra.ExactArgs(1),
	ValidArgsFunction: completeToolName,
	Short:             "Detailed metadata, binaries, and disk locations for a tool",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		targetTool := config.FindTool(services.ToolConfigs, args[0])
		if targetTool == nil {
			return fmt.Errorf("tool %q not found", args[0])
		}

		method := targetTool.InstallationMethod
		if method == "" {
			method = "shell"
		}

		regTool, _ := services.Registry.GetToolInstallation(ctx, targetTool.Name)
		installed := regTool != nil
		installedVersion := ""
		installPath := ""
		if regTool != nil {
			installedVersion = regTool.Version
			installPath = regTool.InstallPath
		}

		binNames := installer.GetBinaryNames(targetTool.Name, targetTool.Binaries)
		binLocations := make([]BinaryLocationInfo, 0, len(binNames))
		for _, bName := range binNames {
			shimPath := filepath.Join(services.ProjectConfig.Paths.TargetDir, bName)
			payloadPath := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current", bName)
			exists, _ := fileExists(payloadPath)
			binLocations = append(binLocations, BinaryLocationInfo{
				Name:        bName,
				ShimPath:    shimPath,
				PayloadPath: payloadPath,
				Exists:      exists,
			})
		}

		configuredVersion := ""
		if targetTool.Version != nil {
			configuredVersion = *targetTool.Version
		}

		report := ToolInfoReport{
			Name:               targetTool.Name,
			ConfigFilePath:     targetTool.ConfigFilePath,
			InstallationMethod: method,
			ConfiguredVersion:  configuredVersion,
			Installed:          installed,
			InstalledVersion:   installedVersion,
			InstallPath:        installPath,
			Disabled:           targetTool.Disabled,
			Dependencies:       targetTool.Dependencies,
			Binaries:           binLocations,
			SymlinksCount:      len(targetTool.Symlinks),
			CopiesCount:        len(targetTool.Copies),
			BlocksCount:        len(targetTool.Blocks),
			TemplatesCount:     len(targetTool.Templates),
		}

		if toolInfoJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), report)
		}

		if cliout.IsAgentMode() {
			fmt.Fprintf(cmd.OutOrStdout(), "tool:%s method:%s installed:%t\n", report.Name, report.InstallationMethod, report.Installed)
			fmt.Fprintf(cmd.OutOrStdout(), "config:%s\n", report.ConfigFilePath)
			if report.InstalledVersion != "" {
				fmt.Fprintf(cmd.OutOrStdout(), "version:%s\n", report.InstalledVersion)
			}
			if report.InstallPath != "" {
				fmt.Fprintf(cmd.OutOrStdout(), "installPath:%s\n", report.InstallPath)
			}
			for _, b := range report.Binaries {
				fmt.Fprintf(cmd.OutOrStdout(), "bin:%s shim:%s payload:%s exists:%t\n", b.Name, b.ShimPath, b.PayloadPath, b.Exists)
			}
			return nil
		}

		fmt.Fprintf(cmd.OutOrStdout(), "Tool: %s\n", report.Name)
		fmt.Fprintf(cmd.OutOrStdout(), "  Method:       %s\n", report.InstallationMethod)
		fmt.Fprintf(cmd.OutOrStdout(), "  Config File:  %s\n", report.ConfigFilePath)
		if report.ConfiguredVersion != "" {
			fmt.Fprintf(cmd.OutOrStdout(), "  Config Version: %s\n", report.ConfiguredVersion)
		}
		status := "Not installed"
		if report.Installed {
			status = "Installed"
			if report.InstalledVersion != "" {
				status += fmt.Sprintf(" (%s)", report.InstalledVersion)
			}
		}
		fmt.Fprintf(cmd.OutOrStdout(), "  Status:       %s\n", status)
		if report.InstallPath != "" {
			fmt.Fprintf(cmd.OutOrStdout(), "  Install Path: %s\n", report.InstallPath)
		}
		if len(report.Dependencies) > 0 {
			fmt.Fprintf(cmd.OutOrStdout(), "  Dependencies: %s\n", strings.Join(report.Dependencies, ", "))
		}
		if len(report.Binaries) > 0 {
			fmt.Fprintf(cmd.OutOrStdout(), "  Binaries:\n")
			for _, b := range report.Binaries {
				state := "missing"
				if b.Exists {
					state = "on disk"
				}
				fmt.Fprintf(cmd.OutOrStdout(), "    - %s (%s)\n", b.Name, state)
				fmt.Fprintf(cmd.OutOrStdout(), "      shim:    %s\n", b.ShimPath)
				fmt.Fprintf(cmd.OutOrStdout(), "      payload: %s\n", b.PayloadPath)
			}
		}
		return nil
	},
}

func init() {
	toolInfoCmd.Flags().BoolVar(&toolInfoJSON, "json", false, "Output tool info in JSON format")
}
