package catalog

import (
	"testing"
)

func testDetail() (ToolDetail, IndexEntry) {
	m := testManifest()
	data, _ := CanonicalJSON(m) // fixture has only supported JSON values
	ref := Blob(data)
	detail := ToolDetail{SchemaVersion: 1, SourceCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", SourcePath: "tools/b/a/bat", Metadata: testMetadata(), Definitions: []DefinitionRef{{Name: "default", Revision: ref.SHA256, Manifest: ref}}, Verification: []VerificationCheck{{Definition: "default", DefinitionRevision: ref.SHA256, Target: m.SupportedTargets[0], CheckedAt: "2026-10-01T00:00:00Z", Outcome: "passed", LastSuccessfulCheck: new("2026-10-01T00:00:00Z"), RunnerImage: "disposable-linux", CLIVersion: "2.6.0", DescriptorDigest: Blob([]byte("descriptor")).SHA256, Dependencies: []VerificationDependency{{ProviderID: "node", Definition: "default", Revision: Blob([]byte("node")).SHA256}}, LogURL: "https://example.test/log"}}}
	entry := IndexEntry{ID: "bat", DisplayName: detail.Metadata.DisplayName, Description: detail.Metadata.Description, Categories: detail.Metadata.Categories, SourcePath: detail.SourcePath, Detail: Blob(nil), Definitions: []IndexDefinition{{Name: "default", Revision: ref.SHA256, MinimumCLIVersion: m.MinimumCLIVersion, Summaries: []IndexTarget{{Target: m.SupportedTargets[0], InstallationMethod: m.Summaries[0].InstallationMethod}}, Verification: []IndexVerification{{Target: m.SupportedTargets[0], Outcome: "passed", CheckedAt: "2026-10-01T00:00:00Z", LastSuccessfulCheck: new("2026-10-01T00:00:00Z")}}}}, VerificationStatus: "verified"}
	return detail, entry
}

func TestDetailVerificationAndIdentity(t *testing.T) {
	detail, entry := testDetail()
	if err := detail.Validate(entry, queryRegistry(), detail.SourceCommit); err != nil {
		t.Fatal(err)
	}
	changes := []struct {
		name   string
		change func(*ToolDetail, *IndexEntry)
	}{
		{"schema", func(d *ToolDetail, e *IndexEntry) { d.SchemaVersion = 2 }},
		{"source commit", func(d *ToolDetail, e *IndexEntry) { d.SourceCommit = "HEAD" }},
		{"source path", func(d *ToolDetail, e *IndexEntry) { d.SourcePath = "tools/a/a/bat" }},
		{"metadata", func(d *ToolDetail, e *IndexEntry) { d.Metadata.License = "" }},
		{"definition count", func(d *ToolDetail, e *IndexEntry) { d.Definitions = nil }},
		{"definition revision", func(d *ToolDetail, e *IndexEntry) { d.Definitions[0].Revision = Blob(nil).SHA256 }},
		{"manifest size", func(d *ToolDetail, e *IndexEntry) { d.Definitions[0].Manifest.Size = maxManifestBytes + 1 }},
		{"minimum CLI", func(d *ToolDetail, e *IndexEntry) { e.Definitions[0].MinimumCLIVersion = "2.5.0" }},
		{"check revision", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].DefinitionRevision = Blob(nil).SHA256 }},
		{"check duplicate", func(d *ToolDetail, e *IndexEntry) { d.Verification = append(d.Verification, d.Verification[0]) }},
		{"check outcome", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].Outcome = "enterprise-passed" }},
		{"check CLI", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].CLIVersion = "latest" }},
		{"runner", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].RunnerImage = "" }},
		{"log URL", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].LogURL = "http://example.test/log" }},
		{"descriptor digest", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].DescriptorDigest = "bad" }},
		{"provider ID", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].Dependencies[0].ProviderID = "BAD" }},
		{"provider definition", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].Dependencies[0].Definition = "BAD" }},
		{"provider revision", func(d *ToolDetail, e *IndexEntry) { d.Verification[0].Dependencies[0].Revision = "bad" }},
		{"provider duplicate", func(d *ToolDetail, e *IndexEntry) {
			d.Verification[0].Dependencies = append(d.Verification[0].Dependencies, d.Verification[0].Dependencies[0])
		}},
		{"index evidence missing", func(d *ToolDetail, e *IndexEntry) { e.Definitions[0].Verification = nil }},
	}
	for _, tt := range changes {
		t.Run(tt.name, func(t *testing.T) {
			detail, entry := testDetail()
			tt.change(&detail, &entry)
			if err := detail.Validate(entry, queryRegistry(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); err == nil {
				t.Fatal("inconsistent detail accepted")
			}
		})
	}
}

func TestDetailChecksOrderFractionalSeconds(t *testing.T) {
	detail, entry := testDetail()
	first := detail.Verification[0]
	first.CheckedAt = "2026-10-01T00:00:00Z"
	first.LastSuccessfulCheck = new(first.CheckedAt)
	second := first
	second.CheckedAt = "2026-10-01T00:00:00.1Z"
	second.LastSuccessfulCheck = new(second.CheckedAt)
	detail.Verification = []VerificationCheck{first, second}
	entry.Definitions[0].Verification[0].CheckedAt = second.CheckedAt
	entry.Definitions[0].Verification[0].LastSuccessfulCheck = second.LastSuccessfulCheck
	if err := detail.Validate(entry, queryRegistry(), detail.SourceCommit); err != nil {
		t.Fatalf("chronological check history rejected: %v", err)
	}
}
