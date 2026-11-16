package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func devTestBinary(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestToolDevUseOffWorkflow(t *testing.T) {
	p := newE2EProject(t, tsTools{"release--suite": `install("github-release", {repo: "owner/suite"}).bin("foo").bin("bar", {shim: false})`})
	foo := devTestBinary(t, p.Root, "foo-build", "#!/bin/sh\necho development\n")
	bar := devTestBinary(t, p.Root, "bar-build", "#!/bin/sh\necho hidden-development\n")
	releasePath := filepath.Join(p.GeneratedDir, "binaries", "release--suite", "current")
	if err := os.MkdirAll(releasePath, 0755); err != nil {
		t.Fatal(err)
	}
	release := devTestBinary(t, releasePath, "foo", "#!/bin/sh\necho release\n")
	p.seedInstallation(t, "release--suite", "1.2.3", releasePath)
	before := p.installation(t, "release--suite")
	out, err := p.run("tool", "dev", "use", "suite", "--bin", "foo="+foo, "--bin", "bar="+bar, "--version", "local.7", "--source-repo", p.Root)
	if err != nil {
		t.Fatalf("use: %v\n%s", err, out.Combined)
	}
	store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
	record, err := store.Lookup("release--suite")
	if err != nil || record == nil {
		t.Fatalf("record = %#v, error = %v", record, err)
	}
	if record.Version != "local.7" || record.SourceRepo != p.Root {
		t.Fatalf("metadata = %#v", record)
	}
	if !reflect.DeepEqual(p.installation(t, "release--suite"), before) {
		t.Fatal("development registration changed the release receipt")
	}
	if data, err := os.ReadFile(release); err != nil || string(data) != "#!/bin/sh\necho release\n" {
		t.Fatalf("release changed: %q, %v", data, err)
	}
	for _, source := range []string{foo, bar} {
		if err := os.Remove(source); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Validate(record); err != nil {
		t.Fatalf("copied build depends on deleted source: %v", err)
	}
	shimPath := filepath.Join(p.TargetDir, "foo")
	shim, err := os.ReadFile(shimPath)
	if err != nil || !strings.Contains(string(shim), record.Binaries["foo"]) {
		t.Fatalf("shim does not route to dev: %v\n%s", err, shim)
	}
	if _, err := os.Stat(filepath.Join(p.TargetDir, "bar")); !os.IsNotExist(err) {
		t.Fatalf("shim:false binary got a shim: %v", err)
	}
	out, err = p.run("tool", "dev", "list", "--json")
	var records []devtools.Record
	if err != nil || json.Unmarshal([]byte(out.Stdout), &records) != nil || len(records) != 1 || records[0].Tool != "release--suite" {
		t.Fatalf("list: %v\n%s", err, out.Combined)
	}
	out, err = p.run("tool", "dev", "off", "foo")
	if err != nil {
		t.Fatalf("off: %v\n%s", err, out.Combined)
	}
	if active, err := store.Lookup("release--suite"); err != nil || active != nil {
		t.Fatalf("off retained active record: %#v, %v", active, err)
	}
	shim, err = os.ReadFile(shimPath)
	if err != nil || strings.Contains(string(shim), record.Binaries["foo"]) || !strings.Contains(string(shim), release) {
		t.Fatalf("off did not restore release routing: %v\n%s", err, shim)
	}
	if err := store.Validate(record); err != nil {
		t.Fatalf("off removed payload still used by earlier shims: %v", err)
	}
}

func TestToolDevDryRun(t *testing.T) {
	p := newE2EProject(t, tsTools{"example": `install("github-release", {repo: "owner/example"}).bin("example")`})
	bin := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\nexit 0\n")
	args := []string{"tool", "dev", "use", "example", "--bin", "example=" + bin}
	out, err := p.run(append(args, "--dry-run")...)
	if err != nil || !strings.Contains(out.Stderr, "Would activate") {
		t.Fatalf("dry-run use: %v\n%s", err, out.Combined)
	}
	store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
	if record, err := store.Lookup("example"); err != nil || record != nil {
		t.Fatalf("dry run wrote record: %#v, %v", record, err)
	}
	if _, err := os.Stat(filepath.Join(p.TargetDir, "example")); !os.IsNotExist(err) {
		t.Fatalf("dry run wrote shim: %v", err)
	}
	if out, err = p.run(args...); err != nil {
		t.Fatalf("use: %v\n%s", err, out.Combined)
	}
	record, _ := store.Lookup("example")
	out, err = p.run("tool", "dev", "off", "example", "--dry-run")
	if err != nil || !strings.Contains(out.Stderr, "Would disable") {
		t.Fatalf("dry-run off: %v\n%s", err, out.Combined)
	}
	after, _ := store.Lookup("example")
	if !reflect.DeepEqual(after, record) {
		t.Fatal("dry-run off changed active record")
	}
}

func TestToolDevFailedGenerationRestoresSelection(t *testing.T) {
	p := newE2EProject(t, tsTools{"example": `install("github-release", {repo: "owner/example"}).bin("example")`})
	bin := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\nexit 0\n")
	store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
	previous, err := store.Use(context.Background(), "example", devtools.UseOptions{Binaries: map[string]string{"example": bin}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(p.TargetDir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p.TargetDir, []byte("blocked"), 0644); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"tool", "dev", "use", "example", "--bin", "example=" + bin},
		{"tool", "dev", "off", "example"},
	} {
		if out, err := p.run(args...); err == nil {
			t.Fatalf("expected generation failure: %s", out.Combined)
		}
		after, err := store.Lookup("example")
		if err != nil || !reflect.DeepEqual(after, previous) {
			t.Fatalf("failed change did not restore previous selection: %#v, %v", after, err)
		}
		if err := store.Validate(previous); err != nil {
			t.Fatal(err)
		}
	}
}

func TestDevBinaryMappings(t *testing.T) {
	tool := &config.ToolConfig{Name: "suite", Binaries: []interface{}{config.BinaryConfig{Name: "foo"}, config.BinaryConfig{Name: "bar"}}}
	for _, tc := range []struct {
		entries []string
		want    string
	}{
		{nil, "missing --bin"},
		{[]string{"foo"}, "expected name=source"},
		{[]string{"foo="}, "expected name=source"},
		{[]string{"=foo"}, "expected name=source"},
		{[]string{"foo=a", "foo=b"}, "duplicate"},
		{[]string{"foo=a"}, "bar"},
		{[]string{"foo=a", "bar=b", "extra=c"}, "must match"},
	} {
		if _, err := devBinaryMappings(tool, tc.entries, t.TempDir()); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%v: %v, want %q", tc.entries, err, tc.want)
		}
	}
	if _, err := devBinaryMappings(&config.ToolConfig{Name: "no-binaries"}, nil, ""); err == nil || !strings.Contains(err.Error(), "declares no binaries") {
		t.Fatalf("missing declarations: %v", err)
	}
	home := t.TempDir()
	mappings, err := devBinaryMappings(tool, []string{"foo=~/a", "bar=./b"}, home)
	if err != nil || mappings["foo"] != filepath.Join(home, "a") || !filepath.IsAbs(mappings["bar"]) {
		t.Fatalf("resolved mappings = %#v, %v", mappings, err)
	}
}

func TestToolDevToolSelection(t *testing.T) {
	p := newE2EProject(t, tsTools{"disabled": `install("manual").bin("disabled").disable()`})
	for _, name := range []string{"missing", "disabled"} {
		if _, err := p.run("tool", "dev", "use", name, "--bin", name+"=./build"); err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("use %s: %v", name, err)
		}
	}
	bin := devTestBinary(t, p.Root, "dotfiles-build", "#!/bin/sh\nexit 0\n")
	if out, err := p.run("tool", "dev", "use", "dotfiles", "--bin", "dotfiles="+bin); err != nil {
		t.Fatalf("internal dotfiles: %v\n%s", err, out.Combined)
	}
	if out, err := p.run("path", "get", "devToolsDir"); err != nil || strings.TrimSpace(out.Stdout) != filepath.Join(p.GeneratedDir, "dev-tools") {
		t.Fatalf("devTools path: %v\n%s", err, out.Combined)
	}
}

func TestToolDevOffInactiveTool(t *testing.T) {
	for _, inactive := range []string{"removed", "disabled"} {
		t.Run(inactive, func(t *testing.T) {
			p := newE2EProject(t, tsTools{"example": `install("github-release", {repo: "owner/example"}).bin("example")`})
			bin := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\nexit 0\n")
			if out, err := p.run("tool", "dev", "use", "example", "--bin", "example="+bin); err != nil {
				t.Fatalf("use: %v\n%s", err, out.Combined)
			}
			tools := tsTools{}
			if inactive == "disabled" {
				tools["example"] = `install("github-release", {repo: "owner/example"}).bin("example").disable()`
			}
			p.writeConfig(t, tools, "", "")
			if out, err := p.run("tool", "dev", "off", "example"); err != nil {
				t.Fatalf("off %s: %v\n%s", inactive, err, out.Combined)
			}
			store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
			if record, err := store.Lookup("example"); err != nil || record != nil {
				t.Fatalf("inactive selection = %#v, %v", record, err)
			}
			if _, err := os.Stat(filepath.Join(p.TargetDir, "example")); !os.IsNotExist(err) {
				t.Fatalf("off left the inactive development shim: %v", err)
			}
		})
	}
}
