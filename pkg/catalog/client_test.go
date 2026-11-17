package catalog

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
)

type catalogServer struct {
	server         *httptest.Server
	mu             sync.Mutex
	objects        map[string][]byte
	pointer        []byte
	requests       []string
	status         int
	etag           bool
	corruptPointer bool
}

func newCatalogServer(t *testing.T) *catalogServer {
	t.Helper()
	s := &catalogServer{objects: make(map[string][]byte)}
	object := func(v any) BlobRef {
		data, err := CanonicalJSON(v)
		if err != nil {
			t.Fatal(err)
		}
		ref := Blob(data)
		s.objects[ref.SHA256] = data
		return ref
	}
	m := testManifest()
	source := []byte("export default tool;\r\n")
	s.objects[Blob(source).SHA256] = source
	manifest := object(m)
	detail := ToolDetail{SchemaVersion: 1, SourceCommit: strings.Repeat("a", 40), SourcePath: "tools/b/a/bat", Metadata: testMetadata(), Definitions: []DefinitionRef{{Name: "default", Revision: manifest.SHA256, Manifest: manifest}}, Verification: []VerificationCheck{}}
	index := Index{SchemaVersion: 1, Entries: []IndexEntry{{ID: "bat", DisplayName: detail.Metadata.DisplayName, Description: detail.Metadata.Description, Categories: detail.Metadata.Categories, SourcePath: detail.SourcePath, Detail: object(detail), Definitions: []IndexDefinition{{Name: "default", Revision: manifest.SHA256, MinimumCLIVersion: m.MinimumCLIVersion, Summaries: []IndexTarget{{Target: m.SupportedTargets[0], InstallationMethod: new("github-release")}}, Verification: []IndexVerification{}}}, VerificationStatus: "unverified"}}}
	snapshot := SnapshotPayload{SchemaVersion: 1, SourceCommit: detail.SourceCommit, GeneratedAt: "2026-10-02T00:00:00Z", MinimumReaderVersion: 1, Index: object(index), Categories: object(queryRegistry()), Tombstones: object(TombstoneRegistry{SchemaVersion: 1, Tools: []Tombstone{}})}
	var err error
	s.pointer, err = CanonicalJSON(Pointer{SchemaVersion: 1, Snapshot: object(snapshot)})
	if err != nil {
		t.Fatal(err)
	}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.requests = append(s.requests, r.URL.Path)
		if r.Method != "GET" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("Range") != "" {
			t.Errorf("unexpected request: %s %v", r.Method, r.Header)
		}
		if s.status != 0 {
			w.WriteHeader(s.status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/catalog/v1/latest.json" {
			if s.etag {
				w.Header().Set("ETag", `"pointer"`)
				w.Header().Set("Last-Modified", "Fri, 02 Oct 2026 00:00:00 GMT")
				if r.Header.Get("If-None-Match") == `"pointer"` {
					w.WriteHeader(http.StatusNotModified)
					return
				}
			}
			if s.corruptPointer {
				fmt.Fprint(w, `{"schemaVersion":9}`)
				return
			}
			w.Write(s.pointer)
			return
		}
		data, ok := s.objects[strings.TrimPrefix(r.URL.Path, "/catalog/v1/objects/")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Write(data)
	}))
	t.Cleanup(s.server.Close)
	return s
}

func testClient(t *testing.T, s *catalogServer, filesystem fs.FS) *Client {
	t.Helper()
	client, err := NewClient(ClientOptions{Origin: s.server.URL + "/catalog/", FS: filesystem, CacheDir: "/cache", AllowLoopbackHTTP: true, Now: func() time.Time { return time.Date(2026, 10, 2, 1, 0, 0, 0, time.UTC) }})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestClientDiscoveryCacheAndSelectedDefinition(t *testing.T) {
	s := newCatalogServer(t)
	filesystem := fs.NewMemFS()
	client := testClient(t, s, filesystem)
	emitted := 0
	ctx := lifecycle.WithEmitter(context.Background(), func(context.Context, lifecycle.Event, lifecycle.Details) error {
		emitted++
		return errors.New("catalog must not invoke install hooks")
	})
	discovery, err := client.Discover(ctx, RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(discovery.Index.Entries) != 1 || discovery.IsOffline || discovery.IsStale {
		t.Fatalf("unexpected discovery %+v", discovery)
	}
	if got := len(s.requests); got != 5 {
		t.Fatalf("cold discovery requests %d, want pointer plus four shared objects", got)
	}
	if _, err := client.Discover(ctx, RequestOptions{}); err != nil {
		t.Fatal(err)
	}
	if len(s.requests) != 5 {
		t.Fatal("fresh cache sent requests")
	}
	bundle, err := client.Definition(ctx, discovery, "bat", "default", RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if string(bundle.Files["bat.tool.ts"]) != "export default tool;\r\n" {
		t.Fatal("source bytes changed")
	}
	if emitted != 0 {
		t.Fatal("download invoked installation lifecycle")
	}
	before := len(s.requests)
	offline, err := client.Discover(ctx, RequestOptions{Offline: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Definition(ctx, offline, "bat", "default", RequestOptions{Offline: true}); err != nil {
		t.Fatal(err)
	}
	if len(s.requests) != before || !offline.IsOffline {
		t.Fatal("offline sent requests or lost offline status")
	}
	if _, err := client.Definition(ctx, offline, "BAT", "default", RequestOptions{Offline: true}); err == nil {
		t.Fatal("uppercase lookup accepted")
	}
	if _, err := client.Definition(ctx, offline, "bat", "missing", RequestOptions{Offline: true}); err == nil {
		t.Fatal("unknown variant accepted")
	}
}

func TestClientRevalidationAndMalformedFreshPointer(t *testing.T) {
	s := newCatalogServer(t)
	s.etag = true
	filesystem := fs.NewMemFS()
	client := testClient(t, s, filesystem)
	first, err := client.Discover(context.Background(), RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	before := len(s.requests)
	second, err := client.Discover(context.Background(), RequestOptions{Refresh: true})
	if err != nil {
		t.Fatal(err)
	}
	if first.Snapshot != second.Snapshot || len(s.requests) != before+1 {
		t.Fatal("304 did not reuse cached body")
	}
	s.mu.Lock()
	s.etag = false
	s.corruptPointer = true
	s.mu.Unlock()
	if _, err := client.Discover(context.Background(), RequestOptions{Refresh: true}); err == nil {
		t.Fatal("malformed fresh pointer fell back to stale")
	}
	offline, err := client.Discover(context.Background(), RequestOptions{Offline: true})
	if err != nil || offline.Snapshot != first.Snapshot {
		t.Fatalf("bad fresh pointer replaced good cache: %v", err)
	}
}

func TestClientNetworkStaleAndFreshnessBoundary(t *testing.T) {
	s := newCatalogServer(t)
	client := testClient(t, s, fs.NewMemFS())
	if _, err := client.Discover(context.Background(), RequestOptions{}); err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.status = 403
	s.mu.Unlock()
	stale, err := client.Discover(context.Background(), RequestOptions{Refresh: true})
	if err != nil || !stale.IsStale {
		t.Fatalf("no stale discovery: %+v %v", stale, err)
	}
	if _, err := client.Discover(context.Background(), RequestOptions{RequireFresh: true}); err == nil {
		t.Fatal("mutation freshness accepted failed refresh")
	}
	if _, err := client.Discover(context.Background(), RequestOptions{Offline: true, Refresh: true}); err == nil {
		t.Fatal("offline refresh accepted")
	}
}

func TestClientDryRunAndMissingOfflineObject(t *testing.T) {
	s := newCatalogServer(t)
	filesystem := fs.NewMemFS()
	client := testClient(t, s, filesystem)
	discovery, err := client.Discover(context.Background(), RequestOptions{DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Definition(context.Background(), discovery, "bat", "default", RequestOptions{DryRun: true}); err != nil {
		t.Fatal(err)
	}
	if exists, err := filesystem.Exists("/cache"); err != nil || exists {
		t.Fatalf("dry run wrote cache: %v %v", exists, err)
	}
	if _, err := client.Discover(context.Background(), RequestOptions{Offline: true}); err == nil {
		t.Fatal("missing offline cache accepted")
	}
	discovery, err = client.Discover(context.Background(), RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	before := len(s.requests)
	if _, err := client.Definition(context.Background(), discovery, "bat", "default", RequestOptions{Offline: true}); err == nil || !strings.Contains(err.Error(), "bat") {
		t.Fatalf("missing named definition error: %v", err)
	}
	if len(s.requests) != before {
		t.Fatal("offline missing definition sent requests")
	}
}

func TestClientRejectsOriginAndRedirectBeforeDispatch(t *testing.T) {
	for _, origin := range []string{"https://api.github.com/", "https://github.example/api/v3/", "https://user:pass@example.test/", "http://example.test/", "https://example.test/no-slash", "https://example.test/?query=yes", "https://example.test/../escape/"} {
		if _, err := NewClient(ClientOptions{Origin: origin, FS: fs.NewMemFS(), CacheDir: "/cache"}); err == nil {
			t.Errorf("accepted unsafe origin %q", origin)
		}
	}
	requests := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++; w.Write([]byte("{}")) }))
	defer target.Close()
	for _, location := range []string{target.URL + "/catalog/v1/latest.json", "/outside/latest.json", "/catalog/api/v3/repos", "/catalog/v1/../latest.json"} {
		t.Run(location, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, location, 302) }))
			defer server.Close()
			client, err := NewClient(ClientOptions{Origin: server.URL + "/catalog/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := client.Discover(context.Background(), RequestOptions{}); err == nil {
				t.Fatal("unsafe redirect accepted")
			}
		})
	}
	if requests != 0 {
		t.Fatal("cross-origin redirect dispatched")
	}
}

func TestClientBoundsDecodedBodiesAndCorruptCache(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		writer := gzip.NewWriter(w)
		writer.Write(bytes.Repeat([]byte("x"), maxPointerBytes+1))
		writer.Close()
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{Origin: server.URL + "/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.fetch(context.Background(), "v1/latest.json", maxPointerBytes, nil); err == nil {
		t.Fatal("decoded body exceeded pointer byte limit")
	}
	if _, err := client.Discover(context.Background(), RequestOptions{}); err == nil {
		t.Fatal("decompressed pointer exceeded bound")
	}
	s := newCatalogServer(t)
	filesystem := fs.NewMemFS()
	client = testClient(t, s, filesystem)
	discovery, err := client.Discover(context.Background(), RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	objectPath := filepath.Join(client.cacheDir, "objects", discovery.Payload.Index.SHA256)
	if err := filesystem.WriteFile(objectPath, []byte("corrupt"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Discover(context.Background(), RequestOptions{Offline: true}); err == nil {
		t.Fatal("corrupt offline cache accepted")
	}
	if _, err := client.Discover(context.Background(), RequestOptions{Refresh: true}); err != nil {
		t.Fatalf("online corruption recovery failed: %v", err)
	}
}

func rewriteDefinition(t *testing.T, s *catalogServer, change func(*DefinitionManifest, *ToolDetail, *IndexEntry) []byte) {
	t.Helper()
	pointer, err := Decode[Pointer](s.pointer)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := Decode[SnapshotPayload](s.objects[pointer.Snapshot.SHA256])
	if err != nil {
		t.Fatal(err)
	}
	index, err := Decode[Index](s.objects[payload.Index.SHA256])
	if err != nil {
		t.Fatal(err)
	}
	entry := &index.Entries[0]
	detail, err := Decode[ToolDetail](s.objects[entry.Detail.SHA256])
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := Decode[DefinitionManifest](s.objects[detail.Definitions[0].Manifest.SHA256])
	if err != nil {
		t.Fatal(err)
	}
	raw := change(&manifest, &detail, entry)
	if raw == nil {
		raw, err = CanonicalJSON(manifest)
		if err != nil {
			t.Fatal(err)
		}
	}
	ref := Blob(raw)
	s.objects[ref.SHA256] = raw
	detail.Definitions[0].Manifest = ref
	detail.Definitions[0].Revision = ref.SHA256
	entry.Definitions[0].Revision = ref.SHA256
	object := func(value any) BlobRef {
		data, err := CanonicalJSON(value)
		if err != nil {
			t.Fatal(err)
		}
		ref := Blob(data)
		s.objects[ref.SHA256] = data
		return ref
	}
	entry.Detail = object(detail)
	payload.Index = object(index)
	pointer.Snapshot = object(payload)
	s.pointer, err = CanonicalJSON(pointer)
	if err != nil {
		t.Fatal(err)
	}
}

func TestClientRejectsInconsistentDefinitionObjects(t *testing.T) {
	tests := []struct {
		name   string
		change func(*DefinitionManifest, *ToolDetail, *IndexEntry) []byte
	}{
		{"noncanonical revision", func(m *DefinitionManifest, d *ToolDetail, e *IndexEntry) []byte {
			data, err := CanonicalJSON(*m)
			if err != nil {
				t.Fatal(err)
			}
			return append(data, '\n')
		}},
		{"identity", func(m *DefinitionManifest, d *ToolDetail, e *IndexEntry) []byte {
			m.ID = "another"
			m.Files[0].Path = "another.tool.ts"
			return nil
		}},
		{"target matrix", func(m *DefinitionManifest, d *ToolDetail, e *IndexEntry) []byte {
			m.SupportedTargets[0].Architecture = "arm64"
			m.Summaries[0].Target = m.SupportedTargets[0]
			return nil
		}},
		{"index projection", func(m *DefinitionManifest, d *ToolDetail, e *IndexEntry) []byte {
			e.Definitions[0].Summaries[0].InstallationMethod = new("npm")
			return nil
		}},
		{"detail identity", func(m *DefinitionManifest, d *ToolDetail, e *IndexEntry) []byte {
			d.Metadata.DisplayName = "Changed"
			return nil
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newCatalogServer(t)
			rewriteDefinition(t, s, tt.change)
			client := testClient(t, s, fs.NewMemFS())
			snapshot, err := client.Discover(context.Background(), RequestOptions{})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := client.Definition(context.Background(), snapshot, "bat", "default", RequestOptions{}); err == nil {
				t.Fatal("inconsistent definition accepted")
			}
		})
	}
}

func TestClientCancellation(t *testing.T) {
	s := newCatalogServer(t)
	client := testClient(t, s, fs.NewMemFS())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := client.Discover(ctx, RequestOptions{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	if len(s.requests) != 0 {
		t.Fatal("cancelled discovery dispatched")
	}
}
