package catalog

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

func queryEntry(id, display, description string) IndexEntry {
	target := Target{Platform: "linux", Architecture: "amd64", Libc: "gnu"}
	return IndexEntry{ID: id, DisplayName: display, Description: description, Categories: []string{"terminal"}, Definitions: []IndexDefinition{{Name: "default", Summaries: []IndexTarget{{Target: target, InstallationMethod: new("github-release")}}}}}
}

func queryRegistry() CategoryRegistry {
	return CategoryRegistry{SchemaVersion: 1, Categories: []Category{{ID: "terminal", Label: "Terminal", Description: "Terminal tools"}, {ID: "utility", Label: "Utility", Description: "Utilities"}}}
}

func TestQueryRankingAndPagination(t *testing.T) {
	index := Index{SchemaVersion: 1, Entries: []IndexEntry{queryEntry("x", "Viewer", "Render rg output"), queryEntry("z", "RG viewer", "Read files"), queryEntry("arg", "A tool", "Files"), queryEntry("rgx", "Another tool", "Files"), queryEntry("rg", "Ripgrep", "Search files")}}
	result, err := Query(index, queryRegistry(), QueryOptions{Query: new(" \tRG\r\n "), Page: 1, Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 5 || !result.HasNextPage || *result.Query != "rg" {
		t.Fatalf("wrong result envelope: %+v", result)
	}
	if got := queryIDs(result); !reflect.DeepEqual(got, []string{"rg", "rgx", "arg"}) {
		t.Fatalf("ranked IDs = %v", got)
	}
	result, err = Query(index, queryRegistry(), QueryOptions{Page: 2, Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	if got := queryIDs(result); !reflect.DeepEqual(got, []string{"x", "z"}) || result.HasNextPage {
		t.Fatalf("list second page = %+v", result)
	}
	result, err = Query(index, queryRegistry(), QueryOptions{Page: 10, Limit: 3})
	if err != nil || result.Total != 5 || len(result.Items) != 0 {
		t.Fatalf("empty high page = %+v, %v", result, err)
	}
	result, err = Query(index, queryRegistry(), QueryOptions{Query: new("rg\t files"), Page: 1, Limit: 20})
	if err != nil || result.Total != 4 {
		t.Fatalf("all-token search = %+v, %v", result, err)
	}
	result, err = Query(index, queryRegistry(), QueryOptions{Query: new("terminal"), Page: 1, Limit: 20})
	if err != nil || result.Total != 0 {
		t.Fatalf("category must not become a search field: %+v %v", result, err)
	}
}

func queryIDs(result QueryResult) []string {
	ids := make([]string, len(result.Items))
	for i, item := range result.Items {
		ids[i] = item.Entry.ID
	}
	return ids
}

func TestQuerySameDefinitionTargetAndMethod(t *testing.T) {
	entry := queryEntry("mixed", "Mixed", "Different variants")
	entry.Definitions = append(entry.Definitions, IndexDefinition{Name: "system", Summaries: []IndexTarget{{Target: Target{Platform: "macos", Architecture: "arm64", Libc: "unknown"}, InstallationMethod: new("brew")}}})
	index := Index{SchemaVersion: 1, Entries: []IndexEntry{entry}}
	for _, tt := range []struct {
		platform string
		methods  []string
		want     []string
	}{{"linux", []string{"brew"}, []string{}}, {"linux", []string{"brew", "github-release"}, []string{"default"}}, {"macos", []string{"brew"}, []string{"system"}}} {
		result, err := Query(index, queryRegistry(), QueryOptions{Filters: QueryFilters{Platform: new(tt.platform), Methods: tt.methods}, Page: 1, Limit: 20})
		if err != nil {
			t.Fatal(err)
		}
		got := []string{}
		for _, item := range result.Items {
			got = append(got, item.MatchingDefinitions...)
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Fatalf("platform %s, methods %v matched %v; want %v", tt.platform, tt.methods, got, tt.want)
		}
	}
}

func TestQueryRejectsInvalidInput(t *testing.T) {
	for _, opts := range []QueryOptions{{Query: new("")}, {Query: new(strings.Repeat("a", 201))}, {Page: -1}, {Limit: 101}, {Filters: QueryFilters{Categories: []string{"missing"}}}, {Filters: QueryFilters{Methods: []string{"missing"}}}, {Filters: QueryFilters{Platform: new("darwin")}}, {Filters: QueryFilters{Architecture: new("x86")}}, {Filters: QueryFilters{Libc: new("glibc")}}} {
		if _, err := Query(Index{}, queryRegistry(), opts); err == nil {
			t.Fatalf("invalid options accepted: %+v", opts)
		}
	}
}

func TestQueryFixtureCorpus(t *testing.T) {
	corpus, err := Decode[QueryFixtureCorpus](QueryFixtureBytes())
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range corpus.Cases {
		t.Run(test.Name, func(t *testing.T) {
			result, err := Query(corpus.Index, queryRegistry(), QueryOptions{Query: test.Query, Filters: test.Filters, Page: test.Page, Limit: test.Limit})
			if err != nil {
				t.Fatal(err)
			}
			items := make([]ExpectedQueryItem, len(result.Items))
			for i, item := range result.Items {
				items[i] = ExpectedQueryItem{ID: item.Entry.ID, MatchingDefinitions: item.MatchingDefinitions}
			}
			if result.Total != test.ExpectedTotal || !reflect.DeepEqual(items, test.ExpectedItems) {
				t.Fatalf("query = %d %v, want %d %v", result.Total, items, test.ExpectedTotal, test.ExpectedItems)
			}
		})
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(QueryFixtureBytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if len(raw["cases"]) == 0 {
		t.Fatal("missing corpus cases")
	}
}

func BenchmarkQuery10000(b *testing.B) {
	index := Index{SchemaVersion: 1, Entries: make([]IndexEntry, 10000)}
	for i := range index.Entries {
		index.Entries[i] = queryEntry(fmt.Sprintf("tool-%05d", i), "Synthetic tool", "A synthetic searchable utility")
	}
	registry := queryRegistry()
	opts := QueryOptions{Query: new("synthetic"), Page: 1, Limit: 20}
	b.ResetTimer()
	for b.Loop() {
		if _, err := Query(index, registry, opts); err != nil {
			b.Fatal(err)
		}
	}
}

func TestVerificationFreshness(t *testing.T) {
	now := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	target := Target{Platform: "linux", Architecture: "amd64", Libc: "gnu"}
	check := IndexVerification{Target: target, Outcome: "passed", CheckedAt: now.Add(-30 * 24 * time.Hour).Format(time.RFC3339), LastSuccessfulCheck: new(now.Add(-30 * 24 * time.Hour).Format(time.RFC3339))}
	definition := IndexDefinition{Name: "default", Summaries: []IndexTarget{{Target: target}}, Verification: []IndexVerification{check}}
	if got := VerificationStatus([]IndexDefinition{definition}, now); got != "verified" {
		t.Fatalf("inclusive 30-day boundary = %s", got)
	}
	if got := VerificationStatus([]IndexDefinition{definition}, now.Add(time.Second)); got != "stale" {
		t.Fatalf("aged status = %s", got)
	}
	definition.Verification[0].Outcome = "failed"
	if got := VerificationStatus([]IndexDefinition{definition}, now); got != "failed" {
		t.Fatalf("failure = %s", got)
	}
	definition.Verification[0].Outcome = "unavailable"
	if got := VerificationStatus([]IndexDefinition{definition}, now); got != "stale" {
		t.Fatalf("unavailable with history = %s", got)
	}
	definition.Verification[0].LastSuccessfulCheck = nil
	if got := VerificationStatus([]IndexDefinition{definition}, now); got != "unverified" {
		t.Fatalf("unavailable without history = %s", got)
	}
	definition.Verification[0] = check
	definition.Summaries = append(definition.Summaries, IndexTarget{Target: Target{Platform: "linux", Architecture: "arm64", Libc: "gnu"}})
	if got := VerificationStatus([]IndexDefinition{definition}, now); got != "partial" {
		t.Fatalf("missing target = %s", got)
	}
}
