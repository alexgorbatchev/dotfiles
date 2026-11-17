package catalog

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

type QueryFilters struct {
	Categories   []string `json:"categories"`
	Methods      []string `json:"methods"`
	Platform     *string  `json:"platform"`
	Architecture *string  `json:"architecture"`
	Libc         *string  `json:"libc"`
}

type QueryOptions struct {
	Query   *string
	Filters QueryFilters
	Page    int
	Limit   int
	Now     time.Time
}

type DiscoveryItem struct {
	Entry               IndexEntry `json:"entry"`
	MatchingDefinitions []string   `json:"matchingDefinitions"`
}

type QueryResult struct {
	Query       *string         `json:"query"`
	Page        int             `json:"page"`
	Limit       int             `json:"limit"`
	Total       int             `json:"total"`
	HasNextPage bool            `json:"hasNextPage"`
	Items       []DiscoveryItem `json:"items"`
}

type rankedItem struct {
	item DiscoveryItem
	rank int
}

// Query applies the same bounded, deterministic semantics consumed by the
// browser fixture corpus. It does not load definitions or project configuration.
func Query(index Index, categories CategoryRegistry, options QueryOptions) (QueryResult, error) {
	result, err := queryResult(options, categories)
	if err != nil {
		return QueryResult{}, err
	}
	matches := make([]rankedItem, 0)
	for _, entry := range index.Entries {
		rank, ok := searchRank(entry, result.Query)
		if !ok || !matchesCategories(entry.Categories, options.Filters.Categories) {
			continue
		}
		definitions := matchingDefinitions(entry.Definitions, options.Filters)
		if len(definitions) == 0 {
			continue
		}
		entry.VerificationStatus = VerificationStatus(entry.Definitions, options.Now)
		matches = append(matches, rankedItem{item: DiscoveryItem{Entry: entry, MatchingDefinitions: definitions}, rank: rank})
	}
	slices.SortFunc(matches, func(a, b rankedItem) int {
		if result.Query != nil && a.rank != b.rank {
			return cmp.Compare(a.rank, b.rank)
		}
		return strings.Compare(a.item.Entry.ID, b.item.Entry.ID)
	})
	result.Total = len(matches)
	if result.Page-1 > result.Total/result.Limit {
		return result, nil
	}
	start := (result.Page - 1) * result.Limit
	end := min(start+result.Limit, result.Total)
	result.HasNextPage = end < result.Total
	for _, match := range matches[start:end] {
		result.Items = append(result.Items, match.item)
	}
	return result, nil
}

func queryResult(options QueryOptions, registry CategoryRegistry) (QueryResult, error) {
	result := QueryResult{Query: options.Query, Page: options.Page, Limit: options.Limit, Items: []DiscoveryItem{}}
	if result.Page == 0 {
		result.Page = 1
	}
	if result.Limit == 0 {
		result.Limit = 50
		if result.Query != nil {
			result.Limit = 20
		}
	}
	if result.Page < 1 || result.Limit < 1 || result.Limit > 100 {
		return result, fmt.Errorf("page must be positive and limit must be 1–100")
	}
	if result.Query != nil {
		query := strings.Trim(*result.Query, " \t\n\r\v\f")
		if length := utf8.RuneCountInString(query); length < 1 || length > 200 {
			return result, fmt.Errorf("search query must contain 1–200 characters after trimming")
		}
		query = strings.Join(asciiWords(query), " ")
		result.Query = &query
	}
	return result, options.Filters.Validate(registry)
}

func (f QueryFilters) Validate(registry CategoryRegistry) error {
	for _, id := range f.Categories {
		if !slices.ContainsFunc(registry.Categories, func(c Category) bool { return c.ID == id }) {
			return fmt.Errorf("unknown category %q", id)
		}
	}
	for _, method := range f.Methods {
		if !slices.Contains(config.InstallMethods(), method) {
			return fmt.Errorf("unknown installation method %q", method)
		}
	}
	for _, field := range []struct {
		name    string
		value   *string
		allowed []string
	}{{"platform", f.Platform, []string{"linux", "macos", "windows"}}, {"architecture", f.Architecture, []string{"amd64", "arm64"}}, {"libc", f.Libc, []string{"gnu", "musl", "unknown"}}} {
		if field.value != nil && !slices.Contains(field.allowed, *field.value) {
			return fmt.Errorf("unknown %s %q", field.name, *field.value)
		}
	}
	return nil
}

func asciiFold(value string) string {
	return strings.Map(func(c rune) rune {
		if c >= 'A' && c <= 'Z' {
			return c + ('a' - 'A')
		}
		return c
	}, value)
}

func asciiWords(value string) []string {
	return strings.FieldsFunc(asciiFold(value), func(c rune) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f' })
}

func searchRank(entry IndexEntry, query *string) (int, bool) {
	if query == nil {
		return 0, true
	}
	id := asciiFold(entry.ID)
	display := asciiFold(entry.DisplayName)
	combined := id + " " + display + " " + asciiFold(entry.Description)
	for _, token := range strings.Split(*query, " ") {
		if !strings.Contains(combined, token) {
			return 0, false
		}
	}
	switch {
	case id == *query:
		return 0, true
	case strings.HasPrefix(id, *query):
		return 1, true
	case strings.Contains(id, *query):
		return 2, true
	}
	for _, token := range strings.Split(*query, " ") {
		if !strings.Contains(id+" "+display, token) {
			return 4, true
		}
	}
	return 3, true
}

func matchesCategories(entry, filters []string) bool {
	return len(filters) == 0 || slices.ContainsFunc(filters, func(id string) bool { return slices.Contains(entry, id) })
}

func matchingDefinitions(definitions []IndexDefinition, filters QueryFilters) []string {
	names := make([]string, 0)
	for _, definition := range definitions {
		if slices.ContainsFunc(definition.Summaries, func(summary IndexTarget) bool { return matchesSummary(summary, filters) }) {
			names = append(names, definition.Name)
		}
	}
	slices.SortFunc(names, func(a, b string) int { return strings.Compare(definitionKey(a), definitionKey(b)) })
	return names
}

func matchesSummary(summary IndexTarget, filters QueryFilters) bool {
	return (filters.Platform == nil || summary.Target.Platform == *filters.Platform) && (filters.Architecture == nil || summary.Target.Architecture == *filters.Architecture) && (filters.Libc == nil || summary.Target.Libc == *filters.Libc) && (len(filters.Methods) == 0 || (summary.InstallationMethod != nil && slices.Contains(filters.Methods, *summary.InstallationMethod)))
}
