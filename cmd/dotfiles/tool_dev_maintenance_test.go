package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
)

// A registered build deliberately has no release installation receipt. Maintenance
// must consult local development ownership before assuming it is uninstalled.
func newDevMaintenanceProject(t *testing.T) (e2eProject, *devtools.Store, *devtools.Record) {
	t.Helper()
	p := newE2EProject(t, tsTools{
		"dev":   `install("github-release", { repo: "acme/no-release" }).bin("probe")`,
		"other": `install("manual")`,
	})
	source := filepath.Join(p.Root, "probe")
	if err := os.WriteFile(source, []byte("#!/bin/sh\necho development\n"), 0755); err != nil {
		t.Fatal(err)
	}
	store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
	record, err := store.Use(context.Background(), "dev", devtools.UseOptions{
		Binaries: map[string]string{"probe": source}, Version: "dev-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return p, store, record
}

func TestToolUpdatePreservesDevelopmentOverride(t *testing.T) {
	p, store, record := newDevMaintenanceProject(t)
	if out, err := p.run("tool", "update", "dev"); err != nil {
		t.Fatalf("update without release receipt: %v\n%s", err, out.Combined)
	}
	// An unreadable release receipt and absent development payload must not permit
	// a managed update to replace this explicitly selected local build.
	p.seedUnreadableInstallation(t, "dev")
	if err := os.Remove(record.Binaries["probe"]); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"tool", "update", "dev"},
		{"tool", "update", "dev", "--force"},
		{"tool", "update", "probe", "--shim-mode", "--force"},
		{"tool", "update"},
		{"tool", "update", "--force"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			out, err := p.run(args...)
			if err != nil {
				t.Fatalf("update: %v\n%s", err, out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "Preserving development override")
			got, err := store.Lookup("dev")
			if err != nil || got == nil || got.Generation != record.Generation {
				t.Fatalf("development selection changed: %+v, %v", got, err)
			}
		})
	}
	out, err := p.run("tool", "update", "missing", "dev", "--force")
	if err == nil {
		t.Fatal("unknown sibling tool must fail the batch")
	}
	mustContain(t, "stderr", out.Stderr, "Preserving development override")
}

func TestToolCheckReportsDevelopmentOverride(t *testing.T) {
	p, _, _ := newDevMaintenanceProject(t)
	p.seedUnreadableInstallation(t, "dev")
	for _, args := range [][]string{
		{"tool", "check", "dev", "--json"},
		{"tool", "check", "--installed", "--json"},
	} {
		out, err := p.run(args...)
		if err != nil {
			t.Fatalf("check: %v\n%s", err, out.Combined)
		}
		var results []ToolUpdateResult
		if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
			t.Fatalf("decode output: %v\n%s", err, out.Stdout)
		}
		found := false
		for _, result := range results {
			if result.ToolName != "dev" {
				continue
			}
			found = true
			if result.Status != orchestrator.CheckStatusUnsupported || result.CurrentVersion != "dev-test" || result.Error != "development override active" || result.LatestVersion != "" {
				t.Errorf("development check = %+v", result)
			}
		}
		if !found {
			t.Errorf("development tool was omitted: %+v", results)
		}
	}
	for _, agent := range []string{"0", "1"} {
		t.Run("agent="+agent, func(t *testing.T) {
			t.Setenv("AGENT", agent)
			out, err := p.run("tool", "check", "probe")
			if err != nil {
				t.Fatalf("check: %v\n%s", err, out.Combined)
			}
			mustContain(t, "stdout", out.Stdout, "development override active", "dev-test")
			mustContain(t, "stderr", out.Stderr, "development override active")
		})
	}
}

func TestToolWhichPrefersDevelopmentOverride(t *testing.T) {
	p, _, record := newDevMaintenanceProject(t)
	managed := filepath.Join(p.GeneratedDir, "binaries", "dev", "current", "probe")
	if err := os.MkdirAll(filepath.Dir(managed), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(managed, []byte("managed"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"dev", "probe"} {
		out, err := p.run("tool", "which", name, "--bin")
		if err != nil || strings.TrimSpace(out.Stdout) != record.Binaries["probe"] {
			t.Fatalf("which %s = %s, %v", name, out.Combined, err)
		}
	}
	out, err := p.run("tool", "which", "probe", "--bin", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]string
	if err := json.Unmarshal([]byte(out.Stdout), &result); err != nil {
		t.Fatal(err)
	}
	if result["path"] != record.Binaries["probe"] || result["tool"] != "dev" || result["binary"] != "probe" {
		t.Errorf("which JSON = %v", result)
	}
	if err := os.Remove(record.Binaries["probe"]); err != nil {
		t.Fatal(err)
	}
	out, err = p.run("tool", "which", "probe", "--bin")
	if err == nil || !strings.Contains(err.Error(), "development executable") || out.Stdout != "" {
		t.Fatalf("missing development payload fell back to managed binary: %s, %v", out.Combined, err)
	}
}

func TestToolWhichFindsOrphanedDevelopmentOverride(t *testing.T) {
	p, _, record := newDevMaintenanceProject(t)
	if err := os.Remove(filepath.Join(p.Root, "tools", "dev.tool.ts")); err != nil {
		t.Fatal(err)
	}
	out, err := p.run("tool", "which", "dev", "--bin")
	if err != nil || strings.TrimSpace(out.Stdout) != record.Binaries["probe"] {
		t.Fatalf("orphaned development binary = %s, %v", out.Combined, err)
	}
}

func TestToolWhichRequiresNewlyDeclaredDevelopmentBinary(t *testing.T) {
	p, _, _ := newDevMaintenanceProject(t)
	p.writeConfig(t, tsTools{"dev": `install("manual").bin("probe").bin("new-probe")`}, "", "")
	out, err := p.run("tool", "which", "new-probe", "--bin")
	if err == nil || !strings.Contains(err.Error(), "has no binary new-probe") || out.Stdout != "" {
		t.Fatalf("new declaration must require registration: %s, %v", out.Combined, err)
	}
}

func TestDevelopmentMetadataFailureDoesNotAbortMaintenanceBatch(t *testing.T) {
	p, _, _ := newDevMaintenanceProject(t)
	manifest := filepath.Join(p.GeneratedDir, "dev-tools", "dev", "active.json")
	if err := os.WriteFile(manifest, []byte("not JSON"), 0644); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"tool", "update", "dev", "other"},
		{"tool", "update"},
		{"tool", "check", "--json"},
	} {
		out, err := p.run(args...)
		if err == nil {
			t.Fatalf("corrupt registration must fail %v: %s", args, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "decoding development override")
		if args[1] == "update" && len(args) > 2 {
			mustContain(t, "stderr", out.Stderr, `tool "other" is not installed`)
		}
		if args[1] == "check" {
			mustContain(t, "stdout", out.Stdout, `"other"`, `"failed"`)
		}
	}
	out, err := p.run("tool", "which", "probe", "--bin")
	if err == nil || !strings.Contains(err.Error(), "decoding development override") || out.Stdout != "" {
		t.Fatalf("which must report unreadable ownership: %s, %v", out.Combined, err)
	}
}
