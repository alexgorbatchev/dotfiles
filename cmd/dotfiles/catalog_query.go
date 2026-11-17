package main

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

type catalogQueryFlags struct {
	categories, methods []string
	page, limit         int
}

type catalogDiscoveryResponse struct {
	catalog.ResultContext
	catalog.QueryResult
}

func registerCatalogQueryFlags(cmd *cobra.Command, options *catalogQueryFlags, limit int) {
	flags := cmd.Flags()
	flags.StringArrayVar(&options.categories, "category", nil, "Filter by category; repeat to match any selected category")
	flags.StringArrayVar(&options.methods, "method", nil, "Filter by installation method; repeat to match any selected method")
	flags.IntVar(&options.page, "page", 1, "Result page (starts at 1)")
	flags.IntVar(&options.limit, "limit", limit, "Results per page (1–100)")
	registerCatalogCompletion(cmd, "category", completeCatalogCategory)
}

func catalogFilters(flags catalogQueryFlags) catalog.QueryFilters {
	filters := catalog.QueryFilters{Categories: flags.categories, Methods: flags.methods}
	if platform != "" {
		filters.Platform = new(utils.NormalizePlatform(platform))
	}
	if arch != "" {
		filters.Architecture = new(arch)
	}
	if libc != "" {
		filters.Libc = new(libc)
	}
	return filters
}

func runCatalogQuery(cmd *cobra.Command, query *string, flags catalogQueryFlags) error {
	if flags.page < 1 || flags.limit < 1 || flags.limit > 100 {
		return reportCatalogFailure(cmd, catalogInputError(fmt.Errorf("--page must be positive and --limit must be 1–100")))
	}
	_, snapshot, err := discoverCatalog(cmd, false)
	if err != nil {
		return reportCatalogFailure(cmd, err)
	}
	options := catalog.QueryOptions{Query: query, Filters: catalogFilters(flags), Page: flags.page, Limit: flags.limit, Now: time.Now()}
	result, err := catalog.Query(snapshot.Index, snapshot.Categories, options)
	if err != nil {
		return reportCatalogFailure(cmd, catalogInputError(err))
	}
	response := catalogDiscoveryResponse{ResultContext: snapshot.ResultContext, QueryResult: result}
	warnCatalogSnapshot(cmd, response.ResultContext)
	if catalogFlags.json {
		return cliout.RenderJSON(cmd.OutOrStdout(), response)
	}
	return renderCatalogDiscovery(cmd.OutOrStdout(), response)
}

func renderCatalogDiscovery(out io.Writer, response catalogDiscoveryResponse) error {
	var text strings.Builder
	if cliout.IsAgentMode() {
		text.WriteString(fmt.Sprintf("snapshot:%s generatedAt:%s offline:%t stale:%t total:%d page:%d limit:%d hasNextPage:%t\n", response.Snapshot, response.GeneratedAt, response.IsOffline, response.IsStale, response.Total, response.Page, response.Limit, response.HasNextPage))
	} else {
		text.WriteString(fmt.Sprintf("Catalog snapshot: %s\nGenerated: %s\n%d matching tools; page %d\n", response.Snapshot, response.GeneratedAt, response.Total, response.Page))
	}
	for _, item := range response.Items {
		entry := item.Entry
		if cliout.IsAgentMode() {
			text.WriteString(fmt.Sprintf("id:%s name:%q definitions:%s verification:%s description:%q\n", entry.ID, entry.DisplayName, strings.Join(item.MatchingDefinitions, ","), entry.VerificationStatus, entry.Description))
		} else {
			text.WriteString(fmt.Sprintf("\n%s (%s)\n  %s\n  Definitions: %s; verification: %s\n", entry.DisplayName, entry.ID, entry.Description, strings.Join(item.MatchingDefinitions, ", "), entry.VerificationStatus))
		}
	}
	return writeCatalogText(out, text.String())
}
