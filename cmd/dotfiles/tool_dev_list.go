package main

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
	"github.com/spf13/cobra"
)

var toolDevListCmd = &cobra.Command{
	Use:   "list",
	Args:  cobra.NoArgs,
	Short: "List active development builds",
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile, vm.WithProjectOnly())
		if err != nil {
			return err
		}
		defer services.Close()
		records, err := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir).List()
		if err != nil {
			return err
		}
		jsonOutput, _ := cmd.Flags().GetBool("json")
		if jsonOutput {
			return cliout.RenderJSON(cmd.OutOrStdout(), records)
		}
		if len(records) == 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "No active development builds.")
		}
		for _, record := range records {
			fmt.Fprintf(cmd.OutOrStdout(), "tool:%s version:%s binaries:%s source-repo:%s\n", record.Tool, record.Version,
				strings.Join(slices.Sorted(maps.Keys(record.Binaries)), ","), record.SourceRepo)
		}
		return nil
	},
}

func init() {
	toolDevListCmd.Flags().Bool("json", false, "Output active development builds in JSON format")
}
