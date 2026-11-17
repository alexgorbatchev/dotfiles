package catalog

import (
	"strings"
	"testing"
)

func TestMetadataProvenanceAndOrdering(t *testing.T) {
	for _, change := range []func(*ToolMetadata){
		func(m *ToolMetadata) { m.ID = "CON" }, func(m *ToolMetadata) { m.DisplayName = "" }, func(m *ToolMetadata) { m.License = "" }, func(m *ToolMetadata) { m.Categories = nil }, func(m *ToolMetadata) { m.Maintainers = nil },
		func(m *ToolMetadata) { m.Maintainers = []Maintainer{{GitHub: "same"}, {GitHub: "SAME"}} },
		func(m *ToolMetadata) { m.AssetLicenses = []AssetLicense{{Path: "bat.tool.ts", License: "MIT"}} },
		func(m *ToolMetadata) { m.AssetLicenses = []AssetLicense{{Path: "files/a", License: ""}} },
		func(m *ToolMetadata) {
			m.AssetLicenses = []AssetLicense{{Path: "files/a", License: "MIT", SourceURL: new("http://example.test/a")}}
		},
		func(m *ToolMetadata) {
			m.AssetLicenses = []AssetLicense{{Path: "files/a", License: "MIT"}, {Path: "files/a", License: "MIT"}}
		},
		func(m *ToolMetadata) { m.Definitions[0].Description = "" }, func(m *ToolMetadata) { m.Definitions[0].SupportedTargets = nil },
		func(m *ToolMetadata) {
			m.Definitions[0].SupportedTargets = append(m.Definitions[0].SupportedTargets, m.Definitions[0].SupportedTargets[0])
		},
		func(m *ToolMetadata) { m.Definitions = append(m.Definitions, m.Definitions[0]) },
		func(m *ToolMetadata) {
			m.Definitions = append(m.Definitions, DefinitionMetadata{Name: "BAD", Description: "bad", MinimumCLIVersion: "2.6.0", SupportedTargets: m.Definitions[0].SupportedTargets})
		},
	} {
		m := testMetadata()
		change(&m)
		if err := m.Validate(queryRegistry()); err == nil {
			t.Fatalf("invalid provenance accepted: %+v", m)
		}
	}
	m := testMetadata()
	m.AssetLicenses = []AssetLicense{{Path: "files/a", License: "MIT", SourceURL: new("https://example.test/a")}}
	m.Definitions = append(m.Definitions, DefinitionMetadata{Name: "system", Description: "System package", MinimumCLIVersion: "2.6.0", SupportedTargets: []Target{{Platform: "macos", Architecture: "arm64", Libc: "unknown"}}})
	if err := m.Validate(queryRegistry()); err != nil {
		t.Fatal(err)
	}
	for _, registry := range []CategoryRegistry{{SchemaVersion: 2}, {SchemaVersion: 1, Categories: []Category{{ID: "BAD", Label: "bad", Description: "bad"}}}, {SchemaVersion: 1, Categories: []Category{{ID: "a", Label: "", Description: "d"}}}, {SchemaVersion: 1, Categories: []Category{{ID: "a", Label: "A", Description: ""}}}, {SchemaVersion: 1, Categories: []Category{{ID: "a", Label: "A", Description: "d"}, {ID: "a", Label: "A", Description: "d"}}}} {
		if err := m.Validate(registry); err == nil {
			t.Fatal("invalid taxonomy accepted")
		}
	}
}

func TestManifestPortableValidation(t *testing.T) {
	tests := []struct {
		name   string
		change func(*DefinitionManifest)
	}{
		{"schema", func(m *DefinitionManifest) { m.SchemaVersion = 2 }},
		{"ID", func(m *DefinitionManifest) { m.ID = "BAD" }},
		{"definition", func(m *DefinitionManifest) { m.Name = "BAD" }},
		{"minimum CLI", func(m *DefinitionManifest) { m.MinimumCLIVersion = "2" }},
		{"empty matrix", func(m *DefinitionManifest) { m.SupportedTargets = nil }},
		{"empty files", func(m *DefinitionManifest) { m.Files = nil }},
		{"main missing", func(m *DefinitionManifest) { m.Files[0].Path = "files/source.ts" }},
		{"binary main", func(m *DefinitionManifest) { m.Files[0].IsText = false }},
		{"mode", func(m *DefinitionManifest) { m.Files[0].Mode = "0777" }},
		{"source size", func(m *DefinitionManifest) { m.Files[0].Blob.Size = maxTypeScriptBytes + 1 }},
		{"summary missing", func(m *DefinitionManifest) { m.Summaries = nil }},
		{"duplicate binary", func(m *DefinitionManifest) { m.Summaries[0].Binaries = []BinarySummary{{Name: "bat"}, {Name: "bat"}} }},
		{"empty binary", func(m *DefinitionManifest) { m.Summaries[0].Binaries = []BinarySummary{{Name: ""}} }},
		{"dependency order", func(m *DefinitionManifest) { m.Summaries[0].Dependencies = []string{"z", "a"} }},
		{"hook duplicate", func(m *DefinitionManifest) { m.Summaries[0].Hooks = []string{"after-download", "after-download"} }},
		{"configuration kind", func(m *DefinitionManifest) {
			m.Summaries[0].Configuration = []ConfigurationSummary{{Kind: "unknown", Target: "/a"}}
		}},
		{"configuration target", func(m *DefinitionManifest) {
			m.Summaries[0].Configuration = []ConfigurationSummary{{Kind: "copy", Target: ""}}
		}},
		{"case collision", func(m *DefinitionManifest) {
			m.Files = append(m.Files, BundleFile{Path: "files/A", Blob: Blob(nil), Mode: "0644", IsText: true}, BundleFile{Path: "files/a", Blob: Blob(nil), Mode: "0644", IsText: true})
		}},
		{"directory case collision", func(m *DefinitionManifest) {
			m.Files = append(m.Files, BundleFile{Path: "files/A/b", Blob: Blob(nil), Mode: "0644", IsText: true}, BundleFile{Path: "files/a", Blob: Blob(nil), Mode: "0644", IsText: true})
		}},
		{"oversized bundle", func(m *DefinitionManifest) {
			for _, name := range []string{"a", "b", "c", "d", "e"} {
				m.Files = append(m.Files, BundleFile{Path: "files/" + name, Blob: BlobRef{SHA256: Blob(nil).SHA256, Size: maxAssetBytes}, Mode: "0644", IsText: true})
			}
		}},
		{"oversized manifest", func(m *DefinitionManifest) {
			m.Summaries[0].Configuration = []ConfigurationSummary{{Kind: "copy", Target: "/a", Detail: strings.Repeat("a", maxManifestBytes)}}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := testManifest()
			tt.change(&m)
			if _, err := m.Revision(); err == nil {
				t.Fatal("invalid manifest received revision")
			}
		})
	}
}

func TestTombstoneRules(t *testing.T) {
	valid := TombstoneRegistry{SchemaVersion: 1, Tools: []Tombstone{{ID: "a", Reason: "Retired", ReplacementID: new("b")}}}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, registry := range []TombstoneRegistry{{SchemaVersion: 2}, {SchemaVersion: 1, Tools: []Tombstone{{ID: "BAD", Reason: "retired"}}}, {SchemaVersion: 1, Tools: []Tombstone{{ID: "a", Reason: ""}}}, {SchemaVersion: 1, Tools: []Tombstone{{ID: "a", Reason: "retired", ReplacementID: new("a")}}}, {SchemaVersion: 1, Tools: []Tombstone{{ID: "a", Reason: "retired", ReplacementID: new("BAD")}}}, {SchemaVersion: 1, Tools: []Tombstone{{ID: "a", Reason: "retired"}, {ID: "a", Reason: "retired"}}}} {
		if err := registry.Validate(); err == nil {
			t.Fatal("invalid retirement accepted")
		}
	}
}

func TestVerificationChronologicalTimestamp(t *testing.T) {
	check := IndexVerification{Outcome: "unavailable", CheckedAt: "2026-10-01T00:00:00Z", LastSuccessfulCheck: new("2026-10-01T00:00:00.1Z")}
	if err := validateCheck(check); err == nil {
		t.Fatal("fractional successful timestamp follows latest check")
	}
}
