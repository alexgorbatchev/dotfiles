package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/spf13/cobra"
)

type catalogCLIFixture struct {
	server   *httptest.Server
	mu       sync.Mutex
	requests []string
	objects  map[string][]byte
	pointer  []byte
	manifest catalog.DefinitionManifest
}

func newCatalogCLIFixture(t *testing.T) *catalogCLIFixture {
	t.Helper()
	s := &catalogCLIFixture{objects: make(map[string][]byte)}
	object := func(value any) catalog.BlobRef {
		data, err := catalog.CanonicalJSON(value)
		if err != nil {
			t.Fatal(err)
		}
		ref := catalog.Blob(data)
		s.objects[ref.SHA256] = data
		return ref
	}
	const id = "bat"
	target := catalog.Target{Platform: "linux", Architecture: "amd64", Libc: "gnu"}
	source := []byte("throw new Error('discovery must not evaluate this source');\r\n")
	s.objects[catalog.Blob(source).SHA256] = source
	s.manifest = catalog.DefinitionManifest{SchemaVersion: 1, ID: id, Name: "default", MinimumCLIVersion: Version, SupportedTargets: []catalog.Target{target}, Files: []catalog.BundleFile{{Path: "bat.tool.ts", Blob: catalog.Blob(source), Mode: "0644", IsText: true}}, Summaries: []catalog.TargetSummary{{Target: target, InstallationMethod: new("manual"), Binaries: []catalog.BinarySummary{{Name: id}}, Dependencies: []string{}, Configuration: []catalog.ConfigurationSummary{}, Hooks: []string{}}}}
	if err := s.manifest.Validate(); err != nil {
		t.Fatal(err)
	}
	manifest := object(s.manifest)
	categories := catalog.CategoryRegistry{SchemaVersion: 1, Categories: []catalog.Category{{ID: "terminal", Label: "Terminal", Description: "Terminal tools"}}}
	metadata := catalog.ToolMetadata{SchemaVersion: 1, ID: id, DisplayName: "Bat", Description: "Readable file output", Categories: []string{"terminal"}, UpstreamURL: "https://example.test/bat", Maintainers: []catalog.Maintainer{{GitHub: "maintainer"}}, License: "MIT", AssetLicenses: []catalog.AssetLicense{}, Definitions: []catalog.DefinitionMetadata{{Name: "default", Description: "Portable binary", MinimumCLIVersion: Version, SupportedTargets: []catalog.Target{target}}}}
	detail := catalog.ToolDetail{SchemaVersion: 1, SourceCommit: strings.Repeat("a", 40), SourcePath: "tools/b/a/bat", Metadata: metadata, Definitions: []catalog.DefinitionRef{{Name: "default", Revision: manifest.SHA256, Manifest: manifest}}, Verification: []catalog.VerificationCheck{}}
	index := catalog.Index{SchemaVersion: 1, Entries: []catalog.IndexEntry{{ID: id, DisplayName: metadata.DisplayName, Description: metadata.Description, Categories: metadata.Categories, SourcePath: detail.SourcePath, Detail: object(detail), Definitions: []catalog.IndexDefinition{{Name: "default", Revision: manifest.SHA256, MinimumCLIVersion: Version, Summaries: []catalog.IndexTarget{{Target: target, InstallationMethod: new("manual")}}, Verification: []catalog.IndexVerification{}}}, VerificationStatus: "unverified"}}}
	other := s.manifest
	other.Name = "minimal"
	other.Files = []catalog.BundleFile{{Path: "bat.tool.ts", Blob: catalog.Blob([]byte("throw new Error('unselected source');")), Mode: "0644", IsText: true}}
	s.objects[other.Files[0].Blob.SHA256] = []byte("throw new Error('unselected source');")
	otherRef := object(other)
	detail.Metadata.Definitions = append(detail.Metadata.Definitions, catalog.DefinitionMetadata{Name: other.Name, Description: "Alternative configuration", MinimumCLIVersion: Version, SupportedTargets: []catalog.Target{target}})
	detail.Definitions = append(detail.Definitions, catalog.DefinitionRef{Name: other.Name, Revision: otherRef.SHA256, Manifest: otherRef})
	index.Entries[0].Detail = object(detail)
	index.Entries[0].Definitions = append(index.Entries[0].Definitions, catalog.IndexDefinition{Name: other.Name, Revision: otherRef.SHA256, MinimumCLIVersion: Version, Summaries: []catalog.IndexTarget{{Target: target, InstallationMethod: new("manual")}}, Verification: []catalog.IndexVerification{}})
	retired := catalog.TombstoneRegistry{SchemaVersion: 1, Tools: []catalog.Tombstone{}}
	if err := index.Validate(categories, retired); err != nil {
		t.Fatal(err)
	}
	if err := detail.Validate(index.Entries[0], categories, detail.SourceCommit); err != nil {
		t.Fatal(err)
	}
	payload := catalog.SnapshotPayload{SchemaVersion: 1, SourceCommit: detail.SourceCommit, GeneratedAt: "2026-10-03T00:00:00Z", MinimumReaderVersion: 1, Index: object(index), Categories: object(categories), Tombstones: object(retired)}
	var err error
	s.pointer, err = catalog.CanonicalJSON(catalog.Pointer{SchemaVersion: 1, Snapshot: object(payload)})
	if err != nil {
		t.Fatal(err)
	}
	s.server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.requests = append(s.requests, r.URL.Path)
		if r.Method != http.MethodGet || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Error("unexpected credential/HTTP method")
		}
		w.Header().Set("Content-Type", "application/json")
		data := s.pointer
		if r.URL.Path != "/catalog/v1/latest.json" {
			var ok bool
			data, ok = s.objects[strings.TrimPrefix(r.URL.Path, "/catalog/v1/objects/")]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
		}
		if _, err := w.Write(data); err != nil {
			t.Error(err)
		}
	}))
	previous := http.DefaultClient
	http.DefaultClient = s.server.Client()
	t.Cleanup(func() { http.DefaultClient = previous; s.server.Close() })
	cache, err := filepath.Abs(filepath.Join("../../.tmp", t.Name(), "cache"))
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("XDG_CACHE_HOME", cache)
	t.Cleanup(func() {
		if err := os.RemoveAll(filepath.Dir(cache)); err != nil {
			t.Error(err)
		}
	})
	return s
}

func (s *catalogCLIFixture) count() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.requests) }

func (s *catalogCLIFixture) advanceSnapshot(t *testing.T) string {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	pointer, err := catalog.Decode[catalog.Pointer](s.pointer)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := catalog.Decode[catalog.SnapshotPayload](s.objects[pointer.Snapshot.SHA256])
	if err != nil {
		t.Fatal(err)
	}
	payload.GeneratedAt = "2026-10-03T00:00:01Z"
	data, err := catalog.CanonicalJSON(payload)
	if err != nil {
		t.Fatal(err)
	}
	ref := catalog.Blob(data)
	s.objects[ref.SHA256] = data
	pointer.Snapshot = ref
	s.pointer, err = catalog.CanonicalJSON(pointer)
	if err != nil {
		t.Fatal(err)
	}
	return ref.SHA256
}

func TestCatalogDiscoveryDoesNotLoadProject(t *testing.T) {
	s := newCatalogCLIFixture(t)
	for _, test := range []struct {
		name  string
		args  []string
		total int
	}{
		{"list", []string{"list"}, 1},
		{"search", []string{"search", "  BAT  "}, 1},
		{"no-match", []string{"search", "missing"}, 0},
		{"filter-target", []string{"list", "--platform", "macos"}, 0},
		{"filter-method", []string{"list", "--method", "manual", "--category", "terminal"}, 1},
		{"high-page", []string{"list", "--page", "2"}, 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			args := []string{"--config", "/missing/config.ts", "catalog", "--catalog-url", s.server.URL + "/catalog/", "--json"}
			out, err := runCommand(append(args, test.args...)...)
			if err != nil {
				t.Fatalf("project-free discovery: %v\n%s", err, out.Stderr)
			}
			var response catalogDiscoveryResponse
			if err := json.Unmarshal([]byte(out.Stdout), &response); err != nil {
				t.Fatal(err)
			}
			if response.Total != test.total || response.Snapshot == "" || response.SchemaVersion != 1 || response.IsOffline || out.Stderr != "" {
				t.Fatalf("wrong discovery envelope/streams: %s %s", out.Stdout, out.Stderr)
			}
			if test.name == "high-page" && len(response.Items) != 0 {
				t.Fatal("high page repeated first page")
			}
		})
	}
	if s.count() != 5 {
		t.Fatalf("discovery loaded payloads or ignored fresh cache: %d requests", s.count())
	}
	before := s.count()
	out, err := runCommand("catalog", "list", "--catalog-url", s.server.URL+"/catalog/", "--offline", "--json")
	if err != nil || s.count() != before || !strings.Contains(out.Stdout, `"isOffline": true`) {
		t.Fatalf("offline discovery: %v %s", err, out.Stdout)
	}
	if !strings.Contains(out.Stderr, "current catalog freshness is unknown") {
		t.Fatal("offline result omitted freshness warning")
	}
}

func TestCatalogRefreshFreezesNewSnapshot(t *testing.T) {
	s := newCatalogCLIFixture(t)
	args := []string{"catalog", "list", "--catalog-url", s.server.URL + "/catalog/", "--json"}
	out, err := runCommand(args...)
	var first catalogDiscoveryResponse
	if err != nil || json.Unmarshal([]byte(out.Stdout), &first) != nil {
		t.Fatalf("initial discovery: %v %#v", err, out)
	}
	before := s.count()
	next := s.advanceSnapshot(t)
	out, err = runCommand(args...)
	var cached catalogDiscoveryResponse
	if err != nil || json.Unmarshal([]byte(out.Stdout), &cached) != nil || cached.Snapshot != first.Snapshot || s.count() != before {
		t.Fatalf("warm discovery changed snapshot without refresh: %v %#v", err, out)
	}
	out, err = runCommand(append(args, "--refresh")...)
	var refreshed catalogDiscoveryResponse
	if err != nil || json.Unmarshal([]byte(out.Stdout), &refreshed) != nil || refreshed.Snapshot != next || refreshed.Snapshot == first.Snapshot || s.count() != before+2 {
		t.Fatalf("refresh missed changed pointer or refetched unchanged objects: %v %#v", err, out)
	}
	before = s.count()
	out, err = runCommand(append(args, "--offline")...)
	var offline catalogDiscoveryResponse
	if err != nil || json.Unmarshal([]byte(out.Stdout), &offline) != nil || offline.Snapshot != next || !offline.IsOffline || s.count() != before {
		t.Fatalf("offline lost validated refreshed snapshot: %v %#v", err, out)
	}
}

func TestCatalogDiscoveryModesAndFailures(t *testing.T) {
	s := newCatalogCLIFixture(t)
	for _, agent := range []string{"0", "1"} {
		t.Setenv("AGENT", agent)
		out, err := runCommand("catalog", "list", "--catalog-url", s.server.URL+"/catalog/")
		if err != nil || !strings.Contains(out.Stdout, "bat") || out.Stderr != "" {
			t.Fatalf("human/agent discovery: %v %#v", err, out)
		}
		out, err = runCommand("catalog", "search", "bat", "--catalog-url", s.server.URL+"/catalog/", "--json")
		if err != nil {
			t.Fatal(err)
		}
		if agent == "1" && strings.Contains(strings.TrimSuffix(out.Stdout, "\n"), "\n") {
			t.Fatal("agent JSON was not minified")
		}
	}
	for _, args := range [][]string{
		{"search", ""}, {"list", "--page", "0"}, {"list", "--limit", "101"}, {"list", "--category", "unknown"}, {"list", "--method", "unknown"}, {"list", "--offline", "--refresh"},
	} {
		out, err := runCommand(append([]string{"catalog", "--catalog-url", s.server.URL + "/catalog/", "--json"}, args...)...)
		var failure catalog.Error
		if err == nil || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != "invalid-input" {
			t.Fatalf("typed failure/stream contract for %v: %v %#v", args, err, out)
		}
	}
	out, err := runCommand("catalog", "list", "--catalog-url", "https://api.github.com/", "--json")
	if err == nil || out.Stdout != "" || !strings.Contains(out.Stderr, `"code":"invalid-input"`) {
		t.Fatalf("API origin accepted: %v %#v", err, out)
	}
}

func TestCatalogShowDoesNotEvaluateSource(t *testing.T) {
	s := newCatalogCLIFixture(t)
	args := []string{"--config", "/missing/config.ts", "catalog", "show", "bat", "--catalog-url", s.server.URL + "/catalog/", "--json"}
	out, err := runCommand(args...)
	if err != nil {
		t.Fatalf("project-free show: %v %s", err, out.Stderr)
	}
	var response catalogShowResponse
	if err := json.Unmarshal([]byte(out.Stdout), &response); err != nil {
		t.Fatal(err)
	}
	if response.Detail.Metadata.ID != "bat" || response.SelectedDefinition.Name != "default" || response.DefinitionSource != string(s.objects[s.manifest.Files[0].Blob.SHA256]) || response.PreferredTarget != nil || out.Stderr != "" {
		t.Fatalf("show changed exact selected source or inferred a target: %#v %#v", response, out)
	}
	if s.count() != 8 {
		t.Fatalf("show request closure = %d, want selected detail/manifest/source only", s.count())
	}
	for _, request := range s.requests {
		if strings.Contains(request, catalog.Blob([]byte("throw new Error('unselected source');")).SHA256) {
			t.Fatal("show downloaded an unselected definition source")
		}
	}
	for _, target := range []struct {
		platform string
		want     bool
	}{{"linux", true}, {"macos", false}} {
		out, err = runCommand(append(args, "--platform", target.platform)...)
		if err != nil || json.Unmarshal([]byte(out.Stdout), &response) != nil || (response.PreferredTarget != nil) != target.want {
			t.Fatalf("show manufactured/lost preferred target: %v %#v", err, out)
		}
	}
	for _, agent := range []string{"0", "1"} {
		t.Setenv("AGENT", agent)
		out, err = runCommand("catalog", "show", "bat", "--catalog-url", s.server.URL+"/catalog/")
		if err != nil || !strings.Contains(out.Stdout, "discovery must not evaluate") || !strings.Contains(out.Stdout, "manual") || !strings.Contains(out.Stdout, "MIT") {
			t.Fatalf("show omitted metadata/source/summary: %v %#v", err, out)
		}
	}
	for _, test := range []struct {
		args []string
		code string
	}{{[]string{"show", "missing"}, "not-found"}, {[]string{"show", "BAT"}, "invalid-input"}, {[]string{"show", "bat", "--variant", "missing"}, "not-found"}, {[]string{"show", "bat", "--arch", "invalid"}, "invalid-input"}} {
		out, err = runCommand(append([]string{"catalog", "--catalog-url", s.server.URL + "/catalog/", "--json"}, test.args...)...)
		var failure catalog.Error
		if err == nil || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != test.code {
			t.Fatalf("show failure: %v %#v", err, out)
		}
	}
}

func TestCatalogCompletionUsesOnlyCache(t *testing.T) {
	s := newCatalogCLIFixture(t)
	prefix := []string{"__complete", "catalog", "--catalog-url", s.server.URL + "/catalog/"}
	out, err := runCommand(append(prefix, "show", "b")...)
	if err != nil || strings.Contains(out.Stdout, "bat") || !strings.Contains(out.Stdout, ":4") || s.count() != 0 {
		t.Fatalf("missing-cache completion used network/files: %v %#v", err, out)
	}
	if _, err := runCommand("catalog", "list", "--catalog-url", s.server.URL+"/catalog/"); err != nil {
		t.Fatal(err)
	}
	before := s.count()
	for _, test := range []struct {
		args []string
		want string
	}{{[]string{"show", "b"}, "bat"}, {[]string{"show", "bat", "--variant", "d"}, "default"}, {[]string{"list", "--category", "t"}, "terminal"}, {[]string{"search", "bat", "--category", "t"}, "terminal"}} {
		out, err := runCommand(append(prefix, test.args...)...)
		if err != nil || !strings.Contains(out.Stdout, test.want) || !strings.Contains(out.Stdout, ":4") || s.count() != before {
			t.Fatalf("cached completion %v: %v %#v", test.args, err, out)
		}
	}
	out, err = runCommand(append(prefix, "show", "bat", "extra")...)
	if err != nil || strings.Contains(out.Stdout, "bat\t") || !strings.Contains(out.Stdout, ":4") {
		t.Fatalf("completion accepted extra positional input: %v %#v", err, out)
	}
}

func TestCatalogFlagErrorsUseTypedJSON(t *testing.T) {
	for _, args := range [][]string{{"list", "--limit", "not-a-number"}, {"list", "--unknown"}, {"show", "bat", "--offline=invalid"}} {
		out, err := runCommand(append([]string{"catalog", "--json"}, args...)...)
		var failure catalog.Error
		if err == nil || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != "invalid-input" {
			t.Fatalf("native flag parser error bypassed JSON error contract: %v %#v", err, out)
		}
	}
}

type catalogFailedWriter struct{ err error }

func (w catalogFailedWriter) Write([]byte) (int, error) { return 0, w.err }

func TestCatalogOutputFailuresPreserveCause(t *testing.T) {
	writeErr := errors.New("catalog-output-failure")
	for _, agent := range []string{"0", "1"} {
		t.Setenv("AGENT", agent)
		for _, render := range []func(io.Writer) error{
			func(out io.Writer) error { return renderCatalogDiscovery(out, catalogDiscoveryResponse{}) },
			func(out io.Writer) error { return renderCatalogShow(out, catalogShowResponse{}) },
		} {
			if err := render(catalogFailedWriter{writeErr}); !errors.Is(err, writeErr) {
				t.Fatalf("catalog output lost native write failure: %v", err)
			}
		}
	}
	resetFlags(rootCmd)
	catalogFlags.json = true
	t.Cleanup(func() { catalogFlags.json = false })
	command := &cobra.Command{}
	command.SetErr(catalogFailedWriter{writeErr})
	cause := catalogInputError(errors.New("original catalog failure"))
	err := reportCatalogFailure(command, cause)
	if !errors.Is(err, writeErr) || !errors.Is(err, cause) || errors.Is(err, ErrSilent) {
		t.Fatalf("error renderer discarded cause or hid a failed diagnostic write: %v", err)
	}
}

func TestCatalogHumanDisplayEscapesTerminalControls(t *testing.T) {
	t.Setenv("AGENT", "0")
	source := "first\n\tline\r\x1b]52;c;Y2xpcGJvYXJk\a\n\u202esecond"
	var out strings.Builder
	response := catalogShowResponse{DefinitionSource: source}
	if err := renderCatalogShow(&out, response); err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(out.String(), "\x1b\a\r\u202e") || !strings.Contains(out.String(), "first\n\tline\\r\\x1b") {
		t.Fatalf("human source emitted terminal controls or lost ordinary line layout: %q", out.String())
	}
	if response.DefinitionSource != source {
		t.Fatal("display escaping changed the exact source envelope")
	}
	query := catalogDiscoveryResponse{QueryResult: catalog.QueryResult{Items: []catalog.DiscoveryItem{{Entry: catalog.IndexEntry{ID: "bat", DisplayName: source, Description: source}, MatchingDefinitions: []string{"default"}}}}}
	out.Reset()
	if err := renderCatalogDiscovery(&out, query); err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(out.String(), "\x1b\a\r\u202e") {
		t.Fatal("human metadata emitted terminal controls")
	}
}
