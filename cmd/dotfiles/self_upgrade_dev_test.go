package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestSelfUpgradePreservesDevelopmentBuild(t *testing.T) {
	p := newE2EProject(t, nil)
	bin := devTestBinary(t, p.Root, "dotfiles-build", "#!/bin/sh\nexit 0\n")
	store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
	record, err := store.Use(context.Background(), "release--dotfiles", devtools.UseOptions{Binaries: map[string]string{"dotfiles": bin}, Version: "local"})
	if err != nil {
		t.Fatal(err)
	}
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++ }))
	defer server.Close()
	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)
	for _, args := range [][]string{
		{"self", "upgrade"},
		{"self", "upgrade", "--force"},
		{"self", "upgrade", "1.2.3", "--force"},
		{"self", "upgrade", "--check"},
		{"self", "upgrade", "--dry-run"},
	} {
		out, err := p.run(args...)
		if err != nil || !strings.Contains(out.Stderr, "Development build active") {
			t.Fatalf("%v: %v\n%s", args, err, out.Combined)
		}
	}
	if requests != 0 {
		t.Fatalf("development self upgrade queried upstream %d times", requests)
	}
	if err := os.Remove(record.Binaries["dotfiles"]); err != nil {
		t.Fatal(err)
	}
	out, err := p.run("self", "upgrade", "--force")
	if err != nil || !strings.Contains(out.Stderr, "Development build active") || requests != 0 {
		t.Fatalf("missing dev payload lost protection: %v\n%s", err, out.Combined)
	}
	if err := os.MkdirAll(filepath.Join(p.Root, "tools"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(p.Root, "tools", "broken.tool.ts"), []byte("not typescript !!!"), 0644); err != nil {
		t.Fatal(err)
	}
	out, err = p.run("self", "upgrade", "--force")
	if err != nil || !strings.Contains(out.Stderr, "Development build active") {
		t.Fatalf("broken tool config bypassed protection: %v\n%s", err, out.Combined)
	}
}

func TestSelfDevelopmentExecutable(t *testing.T) {
	root := t.TempDir()
	bin := devTestBinary(t, root, "source", "#!/bin/sh\nexit 0\n")
	store := devtools.New(fs.NewOSFS(), filepath.Join(root, "custom-dev-store"))
	record, err := store.Use(context.Background(), "dotfiles", devtools.UseOptions{Binaries: map[string]string{"dotfiles": bin}})
	if err != nil {
		t.Fatal(err)
	}
	found, err := selfDevelopmentExecutable(fs.NewOSFS(), record.Binaries["dotfiles"])
	if err != nil || found == nil || found.Generation != record.Generation {
		t.Fatalf("direct invocation not protected: %#v, %v", found, err)
	}
	newer, err := store.Use(context.Background(), "dotfiles", devtools.UseOptions{Binaries: map[string]string{"dotfiles": bin}})
	if err != nil {
		t.Fatal(err)
	}
	found, err = selfDevelopmentExecutable(fs.NewOSFS(), record.Binaries["dotfiles"])
	if err != nil || found == nil || found.Generation != newer.Generation {
		t.Fatalf("previous immutable generation not protected: %#v, %v", found, err)
	}
	for _, executable := range []string{
		bin,
		filepath.Join(root, "other", "build-unknown", "dotfiles"),
		filepath.Join(filepath.Dir(record.Binaries["dotfiles"]), "unregistered"),
	} {
		if found, err := selfDevelopmentExecutable(fs.NewOSFS(), executable); err != nil || found != nil {
			t.Errorf("unregistered %s: %#v, %v", executable, found, err)
		}
	}
}
