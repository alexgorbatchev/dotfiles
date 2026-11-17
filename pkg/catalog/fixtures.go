package catalog

import (
	"bytes"
	_ "embed"
)

//go:embed testdata/query-cases.json
var queryFixtures []byte

// QueryFixtureBytes exports the exact canonical corpus for the pinned catalog
// generator. A copy protects the embedded source from consumer mutation.
func QueryFixtureBytes() []byte { return bytes.Clone(queryFixtures) }

type ExpectedQueryItem struct {
	ID                  string   `json:"id"`
	MatchingDefinitions []string `json:"matchingDefinitions"`
}

type QueryCase struct {
	Name          string              `json:"name"`
	Query         *string             `json:"query"`
	Filters       QueryFilters        `json:"filters"`
	Page          int                 `json:"page"`
	Limit         int                 `json:"limit"`
	ExpectedTotal int                 `json:"expectedTotal"`
	ExpectedItems []ExpectedQueryItem `json:"expectedItems"`
}

type QueryFixtureCorpus struct {
	SchemaVersion int         `json:"schemaVersion"`
	Index         Index       `json:"index"`
	Cases         []QueryCase `json:"cases"`
}
