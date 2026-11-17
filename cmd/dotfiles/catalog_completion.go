package main

import (
	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/spf13/cobra"
)

// cachedCatalogForCompletion never refreshes or repairs the cache. A missing or
// invalid cache provides no suggestions and never enables filesystem completion.
func cachedCatalogForCompletion(cmd *cobra.Command) (catalog.DiscoverySnapshot, error) {
	client, err := catalog.NewClient(catalog.ClientOptions{Origin: catalogFlags.url})
	if err != nil {
		return catalog.DiscoverySnapshot{}, err
	}
	return client.Discover(cmd.Context(), catalog.RequestOptions{Offline: true, DryRun: true})
}

func completeCatalogID(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	if len(args) != 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	snapshot, err := cachedCatalogForCompletion(cmd)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	candidates := make([]cobra.Completion, 0, len(snapshot.Index.Entries))
	for _, entry := range snapshot.Index.Entries {
		candidates = append(candidates, cobra.CompletionWithDesc(entry.ID, entry.DisplayName))
	}
	return filterByPrefix(candidates, toComplete), cobra.ShellCompDirectiveNoFileComp
}

func completeCatalogVariant(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	if len(args) != 1 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	snapshot, err := cachedCatalogForCompletion(cmd)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	var candidates []cobra.Completion
	for _, entry := range snapshot.Index.Entries {
		if entry.ID == args[0] {
			for _, definition := range entry.Definitions {
				candidates = append(candidates, definition.Name)
			}
			break
		}
	}
	return filterByPrefix(candidates, toComplete), cobra.ShellCompDirectiveNoFileComp
}

func completeCatalogCategory(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	snapshot, err := cachedCatalogForCompletion(cmd)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	candidates := make([]cobra.Completion, 0, len(snapshot.Categories.Categories))
	for _, category := range snapshot.Categories.Categories {
		candidates = append(candidates, cobra.CompletionWithDesc(category.ID, category.Label))
	}
	return filterByPrefix(candidates, toComplete), cobra.ShellCompDirectiveNoFileComp
}

func registerCatalogCompletion(cmd *cobra.Command, flag string, complete cobra.CompletionFunc) {
	if err := cmd.RegisterFlagCompletionFunc(flag, complete); err != nil {
		panic(err) // Invalid static command registration is a programming error.
	}
}
