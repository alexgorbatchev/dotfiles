package main

import (
	"fmt"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/spf13/cobra"
)

func runPathGet(cmd *cobra.Command, name string) error {
	ctx := cmd.Context()
	services, err := BootstrapServices(ctx, cfgFile)
	if err != nil {
		return err
	}
	defer services.Close()

	paths := resolveAllPaths(services)
	val, ok := lookupPath(paths, name)
	if !ok {
		validKeys := make([]string, 0, len(paths))
		for k := range paths {
			validKeys = append(validKeys, k)
		}
		slices.Sort(validKeys)
		return fmt.Errorf("unknown path %q: accepted values are %s", name, strings.Join(validKeys, ", "))
	}

	if pathJSON {
		return cliout.RenderJSON(cmd.OutOrStdout(), map[string]string{
			"name": name,
			"path": val,
		})
	}

	fmt.Fprintln(cmd.OutOrStdout(), val)
	return nil
}

var pathGetCmd = &cobra.Command{
	Use:   "get <name>",
	Args:  cobra.ExactArgs(1),
	Short: "Print a specific path (target, binaries, store, cache)",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPathGet(cmd, args[0])
	},
}
