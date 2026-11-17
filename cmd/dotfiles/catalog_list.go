package main

import "github.com/spf13/cobra"

var catalogListFilters catalogQueryFlags

var catalogListCmd = &cobra.Command{
	Use:   "list",
	Short: "List shared tool definitions",
	Args:  catalogArgs(cobra.NoArgs),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCatalogQuery(cmd, nil, catalogListFilters)
	},
}

func init() { registerCatalogQueryFlags(catalogListCmd, &catalogListFilters, 50) }
