package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

func newCatalogClient(cmd *cobra.Command) (*catalog.Client, error) {
	if catalogFlags.url == "" {
		return nil, catalogInputError(fmt.Errorf("catalog URL is not configured; supply --catalog-url with the static download origin"))
	}
	if catalogFlags.offline && catalogFlags.refresh {
		return nil, catalogInputError(fmt.Errorf("--offline and --refresh cannot be combined"))
	}
	return catalog.NewClient(catalog.ClientOptions{Origin: catalogFlags.url, Logger: GetLogger("catalog", cmd.ErrOrStderr())})
}

func catalogRequest(fresh bool) catalog.RequestOptions {
	return catalog.RequestOptions{Offline: catalogFlags.offline, Refresh: catalogFlags.refresh, DryRun: dryRun, RequireFresh: fresh}
}

func discoverCatalog(cmd *cobra.Command, fresh bool) (*catalog.Client, catalog.DiscoverySnapshot, error) {
	client, err := newCatalogClient(cmd)
	if err != nil {
		return nil, catalog.DiscoverySnapshot{}, err
	}
	snapshot, err := client.Discover(cmd.Context(), catalogRequest(fresh))
	if err != nil {
		return nil, snapshot, err
	}
	return client, snapshot, nil
}

func warnCatalogSnapshot(cmd *cobra.Command, snapshot catalog.ResultContext) {
	if snapshot.IsOffline {
		GetLogger("catalog", cmd.ErrOrStderr()).Warn(logger.Message("Offline catalog snapshot generated at " + snapshot.GeneratedAt + "; current catalog freshness is unknown"))
	}
}
