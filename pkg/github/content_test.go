package github_test

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/github"
)

func TestFetchContent_Success(t *testing.T) {
	expectedContent := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\nexport default defineTool((install) => install(\"github-release\"));\n"
	encodedContent := base64.StdEncoding.EncodeToString([]byte(expectedContent))
	// Add arbitrary newlines to simulate GitHub contents API formatting
	formattedEncoded := encodedContent[:20] + "\n" + encodedContent[20:40] + "\r\n" + encodedContent[40:] + "\n"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/owner/mytool/contents/mytool.tool.ts" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Accept") != "application/vnd.github+json" {
			t.Errorf("Accept header = %q, want application/vnd.github+json", r.Header.Get("Accept"))
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"type": "file",
			"encoding": "base64",
			"size": %d,
			"name": "mytool.tool.ts",
			"path": "mytool.tool.ts",
			"content": %q
		}`, len(expectedContent), formattedEncoded)
	}))
	defer server.Close()

	content, err := github.FetchContent(context.Background(), "owner/mytool", "mytool.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err != nil {
		t.Fatalf("FetchContent failed: %v", err)
	}
	if string(content) != expectedContent {
		t.Errorf("content = %q, want %q", string(content), expectedContent)
	}
}

func TestFetchContent_TokenAuth(t *testing.T) {
	var gotAuth string
	var gotUA string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotUA = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"type":"file","encoding":"base64","size":0,"content":""}`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/mytool", "mytool.tool.ts", github.ContentOptions{
		Host:      server.URL,
		Token:     "test-secret-token",
		UserAgent: "custom-agent/2.0",
	})
	if err != nil {
		t.Fatalf("FetchContent failed: %v", err)
	}
	if gotAuth != "token test-secret-token" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "token test-secret-token")
	}
	if gotUA != "custom-agent/2.0" {
		t.Errorf("User-Agent = %q, want %q", gotUA, "custom-agent/2.0")
	}
}

func TestFetchContent_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/missing", "missing.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, github.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got: %v", err)
	}
}

func TestFetchContent_Forbidden_GhCliFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprintf(w, `{"message":"API rate limit exceeded"}`)
	}))
	defer server.Close()

	expectedContent := "export default defineTool();"
	encoded := base64.StdEncoding.EncodeToString([]byte(expectedContent))
	ghJSON := fmt.Sprintf(`{"type":"file","encoding":"base64","content":%q}`, encoded)

	runner := exec.NewMockRunner()
	runner.Register("gh", []byte(ghJSON), nil)

	content, err := github.FetchContent(context.Background(), "owner/mytool", "mytool.tool.ts", github.ContentOptions{
		Host:   server.URL,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("FetchContent with gh fallback failed: %v", err)
	}
	if string(content) != expectedContent {
		t.Errorf("content = %q, want %q", string(content), expectedContent)
	}
}

func TestFetchContent_NetworkError_GhCliFallback(t *testing.T) {
	expectedContent := "export default defineTool();"
	encoded := base64.StdEncoding.EncodeToString([]byte(expectedContent))
	ghJSON := fmt.Sprintf(`{"type":"file","encoding":"base64","content":%q}`, encoded)

	runner := exec.NewMockRunner()
	runner.Register("gh", []byte(ghJSON), nil)

	// Port 1 to trigger connection error
	content, err := github.FetchContent(context.Background(), "owner/mytool", "mytool.tool.ts", github.ContentOptions{
		Host:   "http://127.0.0.1:1",
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("FetchContent with gh fallback after network error failed: %v", err)
	}
	if string(content) != expectedContent {
		t.Errorf("content = %q, want %q", string(content), expectedContent)
	}
}

func TestFetchContent_DirectoryError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[{"name":"subfile.ts","type":"file"}]`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/dir", "dir.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error when fetching directory, got nil")
	}
	if !strings.Contains(err.Error(), "directory") {
		t.Errorf("expected directory error message, got: %v", err)
	}
}

func TestFetchContent_EmptyFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"type":"file","encoding":"","size":0,"content":""}`)
	}))
	defer server.Close()

	content, err := github.FetchContent(context.Background(), "owner/empty", "empty.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err != nil {
		t.Fatalf("FetchContent empty file failed: %v", err)
	}
	if len(content) != 0 {
		t.Errorf("content length = %d, want 0", len(content))
	}
}

func TestFetchContent_FileSizeExceedsLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"type":"file","encoding":"","size":1500000,"content":""}`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/large", "large.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for file exceeding size limit, got nil")
	}
	if !strings.Contains(err.Error(), "exceeds GitHub contents API limit") {
		t.Errorf("expected size limit error message, got: %v", err)
	}
	if !strings.Contains(err.Error(), "1500000") {
		t.Errorf("expected size '1500000' in error message, got: %v", err)
	}
}

func TestFetchContent_InvalidBase64(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"type":"file","encoding":"base64","content":"???NOT_BASE_64???"}`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/corrupt", "corrupt.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for invalid base64, got nil")
	}
	if !strings.Contains(err.Error(), "decoding base64") {
		t.Errorf("expected base64 decoding error, got: %v", err)
	}
}

func TestFetchContent_UnsupportedEncoding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"type":"file","encoding":"gzip","content":"data"}`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/gzip", "gzip.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for unsupported encoding, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported content encoding") {
		t.Errorf("expected unsupported encoding error, got: %v", err)
	}
}

func TestFetchContent_NonFileType(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"type":"submodule","encoding":"base64","content":""}`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/sub", "sub.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for non-file type, got nil")
	}
	if !strings.Contains(err.Error(), "not a file") {
		t.Errorf("expected 'not a file' error, got: %v", err)
	}
}

func TestFetchContent_CorruptedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{not-json`)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/corrupt", "corrupt.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for corrupted json, got nil")
	}
	if !strings.Contains(err.Error(), "parsing GitHub contents API response") {
		t.Errorf("expected json parsing error, got: %v", err)
	}
}

func TestFetchContent_NotFound_GhCliFallbackSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	expectedContent := "export default defineTool();"
	encoded := base64.StdEncoding.EncodeToString([]byte(expectedContent))
	ghJSON := fmt.Sprintf(`{"type":"file","encoding":"base64","content":%q}`, encoded)

	runner := exec.NewMockRunner()
	runner.Register("gh", []byte(ghJSON), nil)

	content, err := github.FetchContent(context.Background(), "owner/private", "private.tool.ts", github.ContentOptions{
		Host:   server.URL,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("FetchContent with gh fallback for 404 failed: %v", err)
	}
	if string(content) != expectedContent {
		t.Errorf("content = %q, want %q", string(content), expectedContent)
	}
}

func TestFetchContent_Forbidden_NoRunner(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
		Host: server.URL,
	})
	if err == nil {
		t.Fatal("expected error for 403, got nil")
	}
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("expected 403 error, got: %v", err)
	}
}

func TestFetchContent_Forbidden_GhCliErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	t.Run("gh returns 404", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("gh", []byte("gh: Not Found (HTTP 404)"), errors.New("exit status 1"))

		_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:   server.URL,
			Runner: runner,
		})
		if !errors.Is(err, github.ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})

	t.Run("gh returns general error", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("gh", []byte("internal error"), errors.New("exit status 1"))

		_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:   server.URL,
			Runner: runner,
		})
		if err == nil || !strings.Contains(err.Error(), "gh fallback") {
			t.Errorf("expected gh fallback error, got: %v", err)
		}
	})
}

func TestFetchContent_NetworkError_NoRunner(t *testing.T) {
	_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
		Host: "http://127.0.0.1:1",
	})
	if err == nil {
		t.Fatal("expected network error, got nil")
	}
	if !strings.Contains(err.Error(), "executing GitHub API request") {
		t.Errorf("expected executing request error, got: %v", err)
	}
}

func TestFetchContent_NetworkError_GhCliNotFound(t *testing.T) {
	runner := exec.NewMockRunner()
	runner.Register("gh", []byte("gh: Not Found (HTTP 404)"), errors.New("exit status 1"))

	_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
		Host:   "http://127.0.0.1:1",
		Runner: runner,
	})
	if !errors.Is(err, github.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got: %v", err)
	}
}

func TestFetchContent_ServerError_500(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	t.Run("no runner", func(t *testing.T) {
		_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host: server.URL,
		})
		if err == nil || !strings.Contains(err.Error(), "500") {
			t.Errorf("expected 500 error, got: %v", err)
		}
	})

	t.Run("runner fallback succeeds", func(t *testing.T) {
		expectedContent := "export default defineTool();"
		encoded := base64.StdEncoding.EncodeToString([]byte(expectedContent))
		ghJSON := fmt.Sprintf(`{"type":"file","encoding":"base64","content":%q}`, encoded)

		runner := exec.NewMockRunner()
		runner.Register("gh", []byte(ghJSON), nil)

		content, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:   server.URL,
			Runner: runner,
		})
		if err != nil {
			t.Fatalf("expected success, got: %v", err)
		}
		if string(content) != expectedContent {
			t.Errorf("content = %q, want %q", string(content), expectedContent)
		}
	})
}

func TestFetchContent_HostNormalization(t *testing.T) {
	runner := exec.NewMockRunner()
	runner.Register("gh", []byte(`{"type":"file","encoding":"base64","content":""}`), nil)

	t.Run("bare github.com with runner", func(t *testing.T) {
		// When host is github.com, it defaults to public API; with network error, runner succeeds
		content, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:       "github.com",
			Runner:     runner,
			HTTPClient: &http.Client{Transport: &failingTransport{}},
		})
		if err != nil {
			t.Fatalf("expected runner success, got: %v", err)
		}
		if len(content) != 0 {
			t.Errorf("expected empty content, got: %v", content)
		}
	})

	t.Run("bare enterprise hostname with runner", func(t *testing.T) {
		runnerGHE := exec.NewMockRunner()
		runnerGHE.Register("gh", []byte(`{"type":"file","encoding":"base64","content":""}`), nil)

		content, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:       "ghe.internal.corp",
			Runner:     runnerGHE,
			HTTPClient: &http.Client{Transport: &failingTransport{}},
		})
		if err != nil {
			t.Fatalf("expected runner success on enterprise host, got: %v", err)
		}
		if len(content) != 0 {
			t.Errorf("expected empty content, got: %v", content)
		}
	})

	t.Run("enterprise hostname with port passed to gh --hostname", func(t *testing.T) {
		runnerGHE := exec.NewMockRunner()
		runnerGHE.Register("gh", []byte(`{"type":"file","encoding":"base64","content":""}`), nil)

		_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:       "https://ghe.internal.corp:8443",
			Runner:     runnerGHE,
			HTTPClient: &http.Client{Transport: &failingTransport{}},
		})
		if err != nil {
			t.Fatalf("expected runner success on enterprise host with port, got: %v", err)
		}
		if len(runnerGHE.History) == 0 {
			t.Fatal("expected runner to be called")
		}
		cmd := runnerGHE.History[0]
		hasHostname := false
		for i, arg := range cmd.Args {
			if arg == "--hostname" && i+1 < len(cmd.Args) {
				if cmd.Args[i+1] != "ghe.internal.corp:8443" {
					t.Errorf("--hostname argument = %q, want %q", cmd.Args[i+1], "ghe.internal.corp:8443")
				}
				hasHostname = true
				break
			}
		}
		if !hasHostname {
			t.Errorf("expected --hostname ghe.internal.corp:8443 in args: %v", cmd.Args)
		}
	})

	t.Run("github enterprise cloud hostname passed to gh --hostname", func(t *testing.T) {
		runnerGHE := exec.NewMockRunner()
		runnerGHE.Register("gh", []byte(`{"type":"file","encoding":"base64","content":""}`), nil)

		_, err := github.FetchContent(context.Background(), "owner/repo", "tool.tool.ts", github.ContentOptions{
			Host:       "https://company.ghe.com",
			Runner:     runnerGHE,
			HTTPClient: &http.Client{Transport: &failingTransport{}},
		})
		if err != nil {
			t.Fatalf("expected runner success on GHE Cloud host, got: %v", err)
		}
		if len(runnerGHE.History) == 0 {
			t.Fatal("expected runner to be called")
		}
		cmd := runnerGHE.History[0]
		hasHostname := false
		for i, arg := range cmd.Args {
			if arg == "--hostname" && i+1 < len(cmd.Args) {
				if cmd.Args[i+1] != "company.ghe.com" {
					t.Errorf("--hostname argument = %q, want %q", cmd.Args[i+1], "company.ghe.com")
				}
				hasHostname = true
				break
			}
		}
		if !hasHostname {
			t.Errorf("expected --hostname company.ghe.com in args: %v", cmd.Args)
		}
	})
}

type failingTransport struct{}

func (f *failingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return nil, errors.New("simulated network failure")
}
