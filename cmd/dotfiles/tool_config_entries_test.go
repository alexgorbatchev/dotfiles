package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// Tool config inspection must distinguish an inaccessible path from a missing one.
type toolConfigFailureFS struct {
	fs.FS
	operation string
}

func (f toolConfigFailureFS) Lstat(path string) (os.FileInfo, error) {
	if f.operation == "lstat" {
		return nil, os.ErrPermission
	}
	return f.FS.Lstat(path)
}
func (f toolConfigFailureFS) Remove(path string) error {
	if f.operation == "remove" {
		return os.ErrPermission
	}
	return f.FS.Remove(path)
}
func (f toolConfigFailureFS) WriteFile(path string, data []byte, mode os.FileMode) error {
	if f.operation == "write" {
		return os.ErrPermission
	}
	return f.FS.WriteFile(path, data, mode)
}

func TestToolConfigEntryFailures(t *testing.T) {
	mem := fs.NewMemFS()
	if err := mem.MkdirAll("/tools", 0755); err != nil {
		t.Fatal(err)
	}
	path := "/tools/example.tool.ts"
	if entry, err := toolConfigEntry(mem, path); err != nil || entry != nil {
		t.Fatalf("missing entry: %v, %v", entry, err)
	}
	if _, err := toolConfigEntry(toolConfigFailureFS{FS: mem, operation: "lstat"}, path); !errors.Is(err, os.ErrPermission) || !strings.Contains(err.Error(), path) {
		t.Fatalf("lost inspection failure: %v", err)
	}
	if err := mem.Symlink("/outside", path); err != nil {
		t.Fatal(err)
	}
	entry, err := toolConfigEntry(mem, path)
	if err != nil || entry == nil || entry.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("dangling link not counted: %v, %v", entry, err)
	}
	if err := writeToolConfig(toolConfigFailureFS{FS: mem, operation: "remove"}, path, []byte("new"), entry); !errors.Is(err, os.ErrPermission) {
		t.Fatalf("lost unlink failure: %v", err)
	}
	if target, err := mem.Readlink(path); err != nil || target != "/outside" {
		t.Fatalf("failed unlink lost link: %q, %v", target, err)
	}
	if err := writeToolConfig(toolConfigFailureFS{FS: mem, operation: "write"}, "/tools/new.tool.ts", []byte("new"), nil); !errors.Is(err, os.ErrPermission) {
		t.Fatalf("lost write failure: %v", err)
	}
}

func TestToolConfigCommandsReplaceEntriesWithoutFollowingLinks(t *testing.T) {
	for _, command := range []string{"add", "scaffold"} {
		for _, dangling := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/dangling=%t", command, dangling), func(t *testing.T) {
				p := newE2EProject(t, tsTools{})
				const original = `import { defineTool } from "@alexgorbatchev/dotfiles"; export default defineTool((install) => install("manual"));`
				var requests atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					fmt.Fprintf(w, `{"type":"file","encoding":"base64","content":%q}`, base64.StdEncoding.EncodeToString([]byte(original+"\n// downloaded")))
				}))
				defer server.Close()
				p.writeConfig(t, tsTools{}, "", `"github": { "host": "`+server.URL+`" }`)
				target := filepath.Join(p.Root, "outside.ts")
				if !dangling {
					if err := os.WriteFile(target, []byte(original), 0644); err != nil {
						t.Fatal(err)
					}
				}
				link := filepath.Join(p.Root, "tools", "probe.tool.ts")
				if err := os.MkdirAll(filepath.Dir(link), 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, link); err != nil {
					t.Fatal(err)
				}
				arg := "probe"
				if command == "add" {
					arg = "owner/probe"
				}
				out, err := p.run("tool", command, arg)
				if command == "add" {
					if err == nil || !strings.Contains(err.Error(), "already exists") {
						t.Fatalf("expected conflict: %v\n%s", err, out.Combined)
					}
				} else if err != nil || !strings.Contains(out.Combined, "already exists, skipping") {
					t.Fatalf("expected skip: %v\n%s", err, out.Combined)
				}
				if requests.Load() != 0 {
					t.Fatalf("rejected overwrite fetched remote config %d times", requests.Load())
				}
				out, err = p.run("--dry-run", "tool", command, "--force", arg)
				if err != nil || !strings.Contains(out.Combined, "Would overwrite") {
					t.Fatalf("dry run: %v\n%s", err, out.Combined)
				}
				if got, err := os.Readlink(link); err != nil || got != target {
					t.Fatalf("dry run changed link: %q, %v", got, err)
				}
				out, err = p.run("tool", command, "--force", arg)
				if err != nil || !strings.Contains(out.Combined, "Overwrote") {
					t.Fatalf("forced replacement: %v\n%s", err, out.Combined)
				}
				info, err := os.Lstat(link)
				if err != nil || !info.Mode().IsRegular() {
					t.Fatalf("link was not replaced: %v, %v", info, err)
				}
				data, err := os.ReadFile(target)
				if dangling {
					if !errors.Is(err, os.ErrNotExist) {
						t.Fatalf("dangling target was created: %q, %v", data, err)
					}
				} else if err != nil || string(data) != original {
					t.Fatalf("outside file changed: %q, %v", data, err)
				}
			})
		}
	}
}
