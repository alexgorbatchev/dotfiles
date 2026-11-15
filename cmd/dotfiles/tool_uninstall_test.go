package main

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestUninstallBatchesContinueAfterFailure(t *testing.T) {
	for _, named := range []bool{false, true} {
		t.Run(fmt.Sprintf("named=%t", named), func(t *testing.T) {
			p := newE2EProject(t, tsTools{"z-broken": `install("manual")`, "a-good": `install("manual")`})
			for _, name := range []string{"z-broken", "a-good"} {
				p.seedInstallation(t, name, "v1.0.0", filepath.Join(p.Root, "installed", name))
			}
			p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, "CREATE TRIGGER keep_broken BEFORE DELETE ON tool_installations WHEN OLD.tool_name = 'z-broken' BEGIN SELECT RAISE(ABORT, 'broken cannot be removed'); END")
				return err
			})
			args := []string{"tool", "uninstall"}
			if named {
				args = append(args, "z-broken", "a-good")
			}
			out, err := p.run(args...)
			if err == nil {
				t.Fatalf("batch succeeded despite uninstall failure\n%s", out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "z-broken", "broken cannot be removed")
			if p.installation(t, "a-good") != nil {
				t.Error("tool after the failure was not uninstalled")
			}
		})
	}
}

func TestUninstallBatchKeepsDependenciesOfFailedTool(t *testing.T) {
	p := newE2EProject(t, tsTools{
		"consumer": `install("manual").dependsOn("provider")`,
		"provider": `install("manual")`,
		"other":    `install("manual")`,
	})
	for _, name := range []string{"consumer", "provider", "other"} {
		p.seedInstallation(t, name, "v1.0.0", filepath.Join(p.Root, "installed", name))
	}
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "CREATE TRIGGER keep_consumer BEFORE DELETE ON tool_installations WHEN OLD.tool_name = 'consumer' BEGIN SELECT RAISE(ABORT, 'consumer cannot be removed'); END")
		return err
	})
	out, err := p.run("tool", "uninstall")
	if err == nil {
		t.Fatalf("uninstall succeeded despite failed consumer\n%s", out.Combined)
	}
	if p.installation(t, "provider") == nil {
		t.Error("dependency was removed while the failed consumer remains installed")
	}
	if p.installation(t, "other") != nil {
		t.Error("independent tool was not uninstalled")
	}
}

func TestUninstallCommand_Errors(t *testing.T) {
	t.Run("unknown tool", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		_, err := p.run("tool", "uninstall", "nope")
		if err == nil || !strings.Contains(err.Error(), `tool "nope" not found in configuration`) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("a dependency cycle stops uninstalling everything", func(t *testing.T) {
		p := newE2EProject(t, tsTools{
			"a": `install().dependsOn("b")`,
			"b": `install().dependsOn("a")`,
		})
		_, err := p.run("tool", "uninstall")
		if err == nil || !strings.Contains(err.Error(), "dependency cycle detected among tools: a, b") {
			t.Fatalf("error = %v, want cycle detection", err)
		}
	})
}
