package main

import (
	"fmt"
	"slices"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/spf13/cobra"
)

func runPathList(cmd *cobra.Command) error {
	ctx := cmd.Context()
	services, err := BootstrapServices(ctx, cfgFile)
	if err != nil {
		return err
	}
	defer services.Close()

	paths := resolveAllPaths(services)

	if pathJSON {
		return cliout.RenderJSON(cmd.OutOrStdout(), paths)
	}

	keys := make([]string, 0, len(paths))
	for k := range paths {
		keys = append(keys, k)
	}
	slices.Sort(keys)

	if cliout.IsAgentMode() {
		for _, k := range keys {
			fmt.Fprintf(cmd.OutOrStdout(), "%s:%s\n", k, paths[k])
		}
	} else {
		for _, k := range keys {
			fmt.Fprintf(cmd.OutOrStdout(), "%-14s %s\n", k+":", paths[k])
		}
	}
	return nil
}

var pathListCmd = &cobra.Command{
	Use:   "list",
	Args:  cobra.NoArgs,
	Short: "Print all resolved paths (target, store, cache, config)",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPathList(cmd)
	},
}
