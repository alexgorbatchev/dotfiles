package main

import (
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/spf13/cobra"
)

var catalogFlags struct {
	url                    string
	offline, refresh, json bool
}

var catalogCmd = &cobra.Command{
	Use:   "catalog",
	Short: "Discover shared tool definitions",
	Args:  catalogArgs(cobra.NoArgs),
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

func init() {
	catalogCmd.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error {
		return reportCatalogFailure(cmd, catalogInputError(err))
	})
	flags := catalogCmd.PersistentFlags()
	flags.StringVar(&catalogFlags.url, "catalog-url", "", "Static catalog directory URL")
	flags.BoolVar(&catalogFlags.offline, "offline", false, "Use the cached catalog without network requests")
	flags.BoolVar(&catalogFlags.refresh, "refresh", false, "Revalidate the catalog publication now")
	flags.BoolVar(&catalogFlags.json, "json", false, "Output the catalog result as JSON")
	catalogCmd.AddCommand(catalogSearchCmd, catalogListCmd, catalogShowCmd)
	rootCmd.AddCommand(catalogCmd)
}

func catalogArgs(validate cobra.PositionalArgs) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if err := validate(cmd, args); err != nil {
			return reportCatalogFailure(cmd, catalogInputError(err))
		}
		return nil
	}
}

func catalogInputError(err error) *catalog.Error {
	return &catalog.Error{SchemaVersion: 1, Code: "invalid-input", Message: err.Error()}
}

func reportCatalogFailure(cmd *cobra.Command, err error) error {
	if !catalogFlags.json {
		return err
	}
	var failure *catalog.Error
	if !errors.As(err, &failure) {
		failure = &catalog.Error{SchemaVersion: 1, Code: "invalid-project", Message: err.Error()}
	}
	log := GetLogger("catalog", cmd.ErrOrStderr())
	if writeErr := cliout.RenderJSON(log.Writer(), failure); writeErr != nil {
		return errors.Join(fmt.Errorf("write catalog error: %w", writeErr), err)
	}
	return errors.Join(ErrSilent, err)
}
