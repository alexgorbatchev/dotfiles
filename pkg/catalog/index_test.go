package catalog

import (
	"strings"
	"testing"
)

func testIndex(t *testing.T) Index {
	t.Helper()
	corpus, err := Decode[QueryFixtureCorpus](QueryFixtureBytes())
	if err != nil {
		t.Fatal(err)
	}
	return corpus.Index
}

func TestIndexCrossValidation(t *testing.T) {
	registry := queryRegistry()
	retired := TombstoneRegistry{SchemaVersion: 1, Tools: []Tombstone{}}
	if err := testIndex(t).Validate(registry, retired); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		change func(*Index)
	}{
		{"schema", func(i *Index) { i.SchemaVersion = 2 }},
		{"duplicate ID", func(i *Index) { i.Entries[1].ID = i.Entries[0].ID }},
		{"source path", func(i *Index) { i.Entries[0].SourcePath = "tools/x/x/arg" }},
		{"display name", func(i *Index) { i.Entries[0].DisplayName = "" }},
		{"description", func(i *Index) { i.Entries[0].Description = "" }},
		{"category", func(i *Index) { i.Entries[0].Categories = []string{"unknown"} }},
		{"blob size", func(i *Index) { i.Entries[0].Detail.Size = maxDetailBytes + 1 }},
		{"blob hash", func(i *Index) { i.Entries[0].Detail.SHA256 = "X" }},
		{"status", func(i *Index) { i.Entries[0].VerificationStatus = "passed" }},
		{"revision", func(i *Index) { i.Entries[0].Definitions[0].Revision = "bad" }},
		{"version", func(i *Index) { i.Entries[0].Definitions[0].MinimumCLIVersion = "latest" }},
		{"method", func(i *Index) { i.Entries[0].Definitions[0].Summaries[0].InstallationMethod = new("custom") }},
		{"target", func(i *Index) { i.Entries[0].Definitions[0].Summaries[0].Target.Platform = "freebsd" }},
		{"missing default", func(i *Index) { i.Entries[0].Definitions[0].Name = "system" }},
		{"unsupported check", func(i *Index) {
			i.Entries[0].Definitions[0].Verification = []IndexVerification{{Target: Target{Platform: "windows", Architecture: "amd64", Libc: "unknown"}, Outcome: "passed", CheckedAt: "2026-10-01T00:00:00Z", LastSuccessfulCheck: new("2026-10-01T00:00:00Z")}}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			index := testIndex(t)
			tt.change(&index)
			if err := index.Validate(registry, retired); err == nil {
				t.Fatal("invalid index accepted")
			}
		})
	}
	retired.Tools = []Tombstone{{ID: "arg", Reason: "Retired", ReplacementID: new("rg")}}
	if err := testIndex(t).Validate(registry, retired); err == nil {
		t.Fatal("active retired ID accepted")
	}
}

func TestPointerAndSnapshotValidation(t *testing.T) {
	ref := Blob([]byte("{}"))
	pointer := Pointer{SchemaVersion: 1, Snapshot: ref}
	if err := pointer.Validate(); err != nil {
		t.Fatal(err)
	}
	pointer.SchemaVersion = 2
	if err := pointer.Validate(); err == nil {
		t.Fatal("unsupported pointer schema accepted")
	}
	snapshot := SnapshotPayload{SchemaVersion: 1, SourceCommit: strings.Repeat("a", 40), GeneratedAt: "2026-10-02T00:00:00Z", MinimumReaderVersion: 1, Index: ref, Categories: ref, Tombstones: ref}
	if err := snapshot.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*SnapshotPayload){func(s *SnapshotPayload) { s.SchemaVersion = 2 }, func(s *SnapshotPayload) { s.MinimumReaderVersion = 2 }, func(s *SnapshotPayload) { s.SourceCommit = "HEAD" }, func(s *SnapshotPayload) { s.GeneratedAt = "2026-10-02T00:00:00+00:00" }, func(s *SnapshotPayload) { s.Index.Size = -1 }} {
		bad := snapshot
		change(&bad)
		if err := bad.Validate(); err == nil {
			t.Fatal("invalid snapshot accepted")
		}
	}
}

func TestVerificationWireValidation(t *testing.T) {
	valid := IndexVerification{Outcome: "passed", CheckedAt: "2026-10-01T00:00:00Z", LastSuccessfulCheck: new("2026-10-01T00:00:00Z")}
	if err := validateCheck(valid); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*IndexVerification){func(c *IndexVerification) { c.Outcome = "enterprise-passed" }, func(c *IndexVerification) { c.CheckedAt = "yesterday" }, func(c *IndexVerification) { c.LastSuccessfulCheck = new("yesterday") }, func(c *IndexVerification) { c.LastSuccessfulCheck = new("2026-10-02T00:00:00Z") }, func(c *IndexVerification) { c.LastSuccessfulCheck = nil }, func(c *IndexVerification) { c.LastSuccessfulCheck = new("2026-09-01T00:00:00Z") }} {
		check := valid
		change(&check)
		if err := validateCheck(check); err == nil {
			t.Fatal("invalid check accepted")
		}
	}
}
