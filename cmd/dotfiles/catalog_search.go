package main

import "github.com/spf13/cobra"

var catalogSearchFilters catalogQueryFlags

var catalogSearchCmd = &cobra.Command{
	Use:               "search <query>",
	Short:             "Search tool names and descriptions",
	Args:              catalogArgs(cobra.ExactArgs(1)),
	ValidArgsFunction: completeNoFileComp,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCatalogQuery(cmd, &args[0], catalogSearchFilters)
	},
}

func init() { registerCatalogQueryFlags(catalogSearchCmd, &catalogSearchFilters, 20) }
