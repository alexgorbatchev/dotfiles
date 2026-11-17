package catalog

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestSourcePath(t *testing.T) {
	tests := []struct{ id, want string }{
		{"j", "tools/j/_/j"}, {"a-b", "tools/a/-/a-b"},
		{"ripgrep", "tools/r/i/ripgrep"}, {strings.Repeat("a", 64), "tools/a/a/" + strings.Repeat("a", 64)},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			got, err := SourcePath(tt.id)
			if err != nil || got != tt.want {
				t.Fatalf("SourcePath = %q, %v; want %q", got, err, tt.want)
			}
		})
	}
	for _, id := range []string{"", "A", "a-", "-a", "a/b", `a\b`, "a.b", "a b", "é", "con", "lpt9", "com1", strings.Repeat("a", 65)} {
		if _, err := SourcePath(id); err == nil {
			t.Errorf("accepted unsafe ID %q", id)
		}
	}
}

func TestDecodeStrictWireShape(t *testing.T) {
	tests := []struct {
		name, data string
		wantError  bool
	}{
		{"valid", `{"sha256":"abc","size":0}`, false},
		{"duplicate", `{"sha256":"a","sha256":"b","size":0}`, true},
		{"case alias", `{"Sha256":"a","size":0}`, true},
		{"unknown", `{"sha256":"a","size":0,"extra":1}`, true},
		{"omitted", `{"sha256":"a"}`, true},
		{"null required", `{"sha256":null,"size":0}`, true},
		{"decimal", `{"sha256":"a","size":1.0}`, true},
		{"exponent", `{"sha256":"a","size":1e2}`, true},
		{"extra value", `{"sha256":"a","size":0} {}`, true},
		{"BOM", "\ufeff" + `{"sha256":"a","size":0}`, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Decode[BlobRef]([]byte(tt.data))
			if (err != nil) != tt.wantError {
				t.Fatalf("Decode error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
	for _, data := range []string{
		`{"schemaVersion":1,"categories":[{"id":"x","label":"X","description":"d","id":"y"}]}`,
		`{"schemaVersion":1,"categories":null}`,
		`{"schemaVersion":1,"categories":[null]}`,
	} {
		if _, err := Decode[CategoryRegistry]([]byte(data)); err == nil {
			t.Errorf("accepted invalid nested shape %s", data)
		}
	}
	data := []byte(`{"path":"files/a","license":"MIT","sourceUrl":null}`)
	if _, err := Decode[AssetLicense](data); err != nil {
		t.Fatal(err)
	}
	if _, err := Decode[AssetLicense](bytes.ReplaceAll(data, []byte(`,"sourceUrl":null`), nil)); err == nil {
		t.Fatal("omitted nullable property accepted")
	}
}

func testMetadata() ToolMetadata {
	return ToolMetadata{SchemaVersion: 1, ID: "bat", DisplayName: "Bat", Description: "Readable file output", Categories: []string{"terminal"}, UpstreamURL: "https://example.test/bat", Maintainers: []Maintainer{{GitHub: "maintainer"}}, License: "MIT", AssetLicenses: []AssetLicense{}, Definitions: []DefinitionMetadata{{Name: "default", Description: "Portable binary", MinimumCLIVersion: "2.6.0", SupportedTargets: []Target{{Platform: "linux", Architecture: "amd64", Libc: "gnu"}}}}}
}

func TestMetadataValidation(t *testing.T) {
	categories := CategoryRegistry{SchemaVersion: 1, Categories: []Category{{ID: "terminal", Label: "Terminal", Description: "Terminal tools"}}}
	if err := testMetadata().Validate(categories); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		change func(*ToolMetadata)
	}{
		{"wrong schema", func(m *ToolMetadata) { m.SchemaVersion = 2 }},
		{"unknown category", func(m *ToolMetadata) { m.Categories = []string{"other"} }},
		{"duplicate category", func(m *ToolMetadata) { m.Categories = []string{"terminal", "terminal"} }},
		{"missing default", func(m *ToolMetadata) { m.Definitions[0].Name = "portable" }},
		{"invalid target", func(m *ToolMetadata) { m.Definitions[0].SupportedTargets[0].Libc = "unknown" }},
		{"nonlinux libc", func(m *ToolMetadata) { m.Definitions[0].SupportedTargets[0].Platform = "windows" }},
		{"version range", func(m *ToolMetadata) { m.Definitions[0].MinimumCLIVersion = "^2.6.0" }},
		{"version shorthand", func(m *ToolMetadata) { m.Definitions[0].MinimumCLIVersion = "2.6" }},
		{"http URL", func(m *ToolMetadata) { m.UpstreamURL = "http://example.test" }},
		{"URL credentials", func(m *ToolMetadata) { m.UpstreamURL = "https://user:pass@example.test" }},
		{"long description", func(m *ToolMetadata) { m.Description = strings.Repeat("a", 281) }},
		{"empty maintainer", func(m *ToolMetadata) { m.Maintainers[0].GitHub = "" }},
		{"unsafe asset", func(m *ToolMetadata) { m.AssetLicenses = []AssetLicense{{Path: "files/../evil", License: "MIT"}} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := testMetadata()
			tt.change(&m)
			if err := m.Validate(categories); err == nil {
				t.Fatal("invalid metadata accepted")
			}
		})
	}
}

func testManifest() DefinitionManifest {
	file := []byte("export default tool;\r\n")
	target := Target{Platform: "linux", Architecture: "amd64", Libc: "gnu"}
	return DefinitionManifest{SchemaVersion: 1, ID: "bat", Name: "default", MinimumCLIVersion: "2.6.0", SupportedTargets: []Target{target}, Files: []BundleFile{{Path: "bat.tool.ts", Blob: Blob(file), Mode: "0644", IsText: true}}, Summaries: []TargetSummary{{Target: target, InstallationMethod: new("github-release"), Binaries: []BinarySummary{}, Dependencies: []string{}, Configuration: []ConfigurationSummary{}, Hooks: []string{}}}}
}

func TestManifestRevisionAndValidation(t *testing.T) {
	m := testManifest()
	if err := m.Validate(); err != nil {
		t.Fatal(err)
	}
	first, err := m.Revision()
	if err != nil {
		t.Fatal(err)
	}
	data, err := CanonicalJSON(m)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode[DefinitionManifest](data)
	if err != nil {
		t.Fatal(err)
	}
	second, err := decoded.Revision()
	if err != nil || first != second {
		t.Fatalf("revision changed after round trip: %s / %s: %v", first, second, err)
	}
	m.Files[0].Mode = "0755"
	third, err := m.Revision()
	if err != nil || third == first {
		t.Fatalf("mode does not advance revision: %v", err)
	}
	for _, path := range []string{"../bat.tool.ts", "/bat.tool.ts", `files\asset`, "files/a/../b", "files/CON", "files/helper.tool.ts"} {
		bad := testManifest()
		bad.Files = append(bad.Files, BundleFile{Path: path, Blob: Blob(nil), Mode: "0644", IsText: true})
		if err := bad.Validate(); err == nil {
			t.Errorf("accepted path %q", path)
		}
	}
	bad := testManifest()
	bad.Summaries[0].InstallationMethod = new("invented")
	if err := bad.Validate(); err == nil {
		t.Fatal("unknown method accepted")
	}
	bad = testManifest()
	bad.Summaries[0].Target.Architecture = "arm64"
	if err := bad.Validate(); err == nil {
		t.Fatal("summary outside matrix accepted")
	}
	bad = testManifest()
	bad.Files = append(bad.Files, BundleFile{Path: "files/a", Blob: Blob(nil), Mode: "0644", IsText: true}, BundleFile{Path: "files/a/b", Blob: Blob(nil), Mode: "0644", IsText: true})
	if err := bad.Validate(); err == nil {
		t.Fatal("file/directory collision accepted")
	}
}

func TestCanonicalJSONAndBlob(t *testing.T) {
	data, err := CanonicalJSON(map[string]any{"z": []any{json.Number("2"), map[string]any{"b": "<value>", "a": 1}}, "a": "é"})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(data), `{"a":"é","z":[2,{"a":1,"b":"<value>"}]}`; got != want {
		t.Fatalf("canonical = %s, want %s", got, want)
	}
	for _, value := range []any{1.2, json.Number("1e2"), map[string]any{"é": 1}} {
		if _, err := CanonicalJSON(value); err == nil {
			t.Errorf("accepted noncanonical %v", value)
		}
	}
	for _, tt := range []struct {
		data []byte
		text bool
	}{{[]byte("line\r\n"), true}, {[]byte{0}, false}, {[]byte{0xff}, false}, {nil, true}} {
		ref := Blob(tt.data)
		if err := ref.Verify(tt.data); err != nil {
			t.Fatal(err)
		}
		if err := ref.Verify(append(bytes.Clone(tt.data), 'x')); err == nil {
			t.Fatal("wrong blob accepted")
		}
		if got := IsText(tt.data); got != tt.text {
			t.Errorf("IsText = %v, want %v", got, tt.text)
		}
	}
}
