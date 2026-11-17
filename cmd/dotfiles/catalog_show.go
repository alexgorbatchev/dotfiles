package main

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/spf13/cobra"
)

type catalogShowResponse struct {
	catalog.ResultContext
	Detail             catalog.ToolDetail         `json:"detail"`
	SelectedDefinition catalog.DefinitionManifest `json:"selectedDefinition"`
	DefinitionSource   string                     `json:"definitionSource"`
	PreferredTarget    *catalog.Target            `json:"preferredTarget"`
}

var catalogShowVariant string

var catalogShowCmd = &cobra.Command{
	Use:               "show <tool>",
	Short:             "Show a tool definition and its source",
	Args:              catalogArgs(cobra.ExactArgs(1)),
	ValidArgsFunction: completeCatalogID,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runCatalogShow(cmd, args[0])
	},
}

func init() {
	catalogShowCmd.Flags().StringVar(&catalogShowVariant, "variant", "default", "Definition variant to show")
	registerCatalogCompletion(catalogShowCmd, "variant", completeCatalogVariant)
}

func runCatalogShow(cmd *cobra.Command, id string) error {
	client, snapshot, err := discoverCatalog(cmd, false)
	if err != nil {
		return reportCatalogFailure(cmd, err)
	}
	filters := catalogFilters(catalogQueryFlags{})
	if _, err := catalog.Query(snapshot.Index, snapshot.Categories, catalog.QueryOptions{Filters: filters, Now: time.Now()}); err != nil {
		return reportCatalogFailure(cmd, catalogInputError(err))
	}
	bundle, err := client.Definition(cmd.Context(), snapshot, id, catalogShowVariant, catalogRequest(false))
	if err != nil {
		return reportCatalogFailure(cmd, err)
	}
	response := catalogShowResponse{ResultContext: snapshot.ResultContext, Detail: bundle.Detail, SelectedDefinition: bundle.Manifest, DefinitionSource: string(bundle.Files[id+".tool.ts"]), PreferredTarget: preferredCatalogTarget(bundle.Manifest, filters)}
	warnCatalogSnapshot(cmd, response.ResultContext)
	if catalogFlags.json {
		return cliout.RenderJSON(cmd.OutOrStdout(), response)
	}
	return renderCatalogShow(cmd.OutOrStdout(), response)
}

func preferredCatalogTarget(manifest catalog.DefinitionManifest, filters catalog.QueryFilters) *catalog.Target {
	if filters.Platform == nil && filters.Architecture == nil && filters.Libc == nil {
		return nil
	}
	for _, target := range manifest.SupportedTargets {
		if filters.Platform != nil && target.Platform != *filters.Platform || filters.Architecture != nil && target.Architecture != *filters.Architecture || filters.Libc != nil && target.Libc != *filters.Libc {
			continue
		}
		return new(target)
	}
	return nil
}

func renderCatalogShow(out io.Writer, response catalogShowResponse) error {
	var text strings.Builder
	if cliout.IsAgentMode() {
		fmt.Fprintf(&text, "snapshot:%s generatedAt:%s offline:%t stale:%t\ndetail:", response.Snapshot, response.GeneratedAt, response.IsOffline, response.IsStale)
	} else {
		fmt.Fprintf(&text, "Catalog snapshot: %s\nGenerated: %s\nMetadata and verification:\n", response.Snapshot, response.GeneratedAt)
	}
	if err := cliout.RenderJSON(&text, response.Detail); err != nil {
		return err
	}
	if cliout.IsAgentMode() {
		text.WriteString("selectedDefinition:")
	} else {
		text.WriteString("Selected definition, target summaries and assets:\n")
	}
	if err := cliout.RenderJSON(&text, response.SelectedDefinition); err != nil {
		return err
	}
	if cliout.IsAgentMode() {
		text.WriteString("preferredTarget:")
	} else {
		text.WriteString("Preferred target:\n")
	}
	if err := cliout.RenderJSON(&text, response.PreferredTarget); err != nil {
		return err
	}
	if cliout.IsAgentMode() {
		fmt.Fprintf(&text, "definitionSource:%q\n", response.DefinitionSource)
	} else {
		text.WriteString("Definition source:\n")
		text.WriteString(response.DefinitionSource)
		if !strings.HasSuffix(response.DefinitionSource, "\n") {
			text.WriteByte('\n')
		}
	}
	return writeCatalogText(out, text.String())
}
