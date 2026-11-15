package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestCleanupBatchesContinueAfterFailure(t *testing.T) {
	p := newE2EProject(t, tsTools{"configured": `install()`})
	for _, name := range []string{"a-broken", "z-good"} {
		p.seedInstallation(t, name, "v1.0.0", filepath.Join(p.Root, "installed", name))
	}
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "CREATE TRIGGER keep_broken BEFORE DELETE ON tool_installations WHEN OLD.tool_name = 'a-broken' BEGIN SELECT RAISE(ABORT, 'cannot remove broken'); END")
		return err
	})
	out, err := p.run("state", "cleanup")
	if err == nil {
		t.Fatalf("cleanup succeeded despite failure\n%s", out.Combined)
	}
	if rec := p.installation(t, "z-good"); rec != nil {
		t.Fatalf("cleanup stopped before healthy orphan: %+v", rec)
	}
	mustContain(t, "stderr", out.Stderr, "[a-broken] Failed to cleanup orphaned tool: ", "cannot remove broken")
}

func TestCleanupCommand_RemovesOrphans(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install("manual")`})
	p.seedInstallation(t, "ghost", "v1.0.0", filepath.Join(p.Root, "installed", "ghost"))
	p.seedInstallation(t, "bat", "v1.0.0", filepath.Join(p.Root, "installed", "bat"))

	out, err := p.run("state", "cleanup")
	if err != nil {
		t.Fatalf("state cleanup: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "[ghost] Cleaning up orphaned tool...")
	if rec := p.installation(t, "ghost"); rec != nil {
		t.Fatalf("ghost is still recorded after cleanup: %+v", rec)
	}
	if rec := p.installation(t, "bat"); rec == nil {
		t.Fatal("bat, which is configured, must survive cleanup")
	}
}

// TestCleanupCommand_FailureLogsNameTheCause pins that cleanup reports each failure
// with its cause outside --trace (#131).
func TestCleanupCommand_FailureLogsNameTheCause(t *testing.T) {
	t.Run("installation records that cannot be read", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		p.seedUnreadableInstallation(t, "ghost")

		out, err := p.run("state", "cleanup")
		if err == nil {
			t.Fatalf("state cleanup succeeded despite unreadable installations\n%s", out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "finding orphaned tools: ", unreadableInstallationCause)
	})

	t.Run("an orphaned tool that cannot be removed", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		p.seedInstallation(t, "ghost", "v1.0.0", filepath.Join(p.Root, "installed", "ghost"))
		p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, "CREATE TRIGGER keep_installations BEFORE DELETE ON tool_installations BEGIN SELECT RAISE(ABORT, 'installations are kept'); END")
			return err
		})

		out, err := p.run("state", "cleanup")
		if err == nil {
			t.Fatalf("state cleanup succeeded despite uninstall failure\n%s", out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[ghost] Failed to cleanup orphaned tool: ", "installations are kept")
	})
}

// TestCleanupCommand_InvokesRecordedInstaller verifies that orphaned tool cleanup invokes
// the recorded installer's Uninstall method with the recorded method (#175).
func TestCleanupCommand_InvokesRecordedInstaller(t *testing.T) {
	t.Run("invokes recorded installer for orphaned tool", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		method := "brew"
		p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
			return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
				ToolName:        "orphan-brew",
				Version:         "v1.0.0",
				InstallPath:     filepath.Join(p.Root, "installed", "orphan-brew"),
				InstallMethod:   &method,
				BinaryPaths:     "[]",
				PackageIdentity: func() *string { value := `{"name":"actual-package"}`; return &value }(),
			})
		})

		var invokedMethod string
		var invokedTool *config.ToolConfig
		mockInstallerUninstallHook = func(m string, tool *config.ToolConfig, installed installer.Installation) error {
			invokedMethod = m
			invokedTool = tool
			return nil
		}
		defer func() { mockInstallerUninstallHook = nil }()

		out, err := p.run("state", "cleanup")
		if err != nil {
			t.Fatalf("state cleanup: %v\n%s", err, out.Combined)
		}
		if invokedMethod != "brew" {
			t.Fatalf("expected installer for 'brew' to be invoked, got %q", invokedMethod)
		}
		if invokedTool == nil || invokedTool.Name != "orphan-brew" {
			t.Fatalf("expected tool 'orphan-brew' to be passed to installer, got %+v", invokedTool)
		}
		if invokedTool.InstallationMethod != "brew" {
			t.Fatalf("expected tool.InstallationMethod 'brew', got %q", invokedTool.InstallationMethod)
		}
		if rec := p.installation(t, "orphan-brew"); rec != nil {
			t.Fatalf("orphan-brew should be cleaned up after successful uninstall, got: %+v", rec)
		}
	})

	t.Run("failing installer leaves orphan recorded", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		method := "brew"
		p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
			return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
				ToolName:        "orphan-brew",
				Version:         "v1.0.0",
				InstallPath:     filepath.Join(p.Root, "installed", "orphan-brew"),
				InstallMethod:   &method,
				BinaryPaths:     "[]",
				PackageIdentity: func() *string { value := `{"name":"actual-package"}`; return &value }(),
			})
		})

		mockInstallerUninstallHook = func(m string, tool *config.ToolConfig, installed installer.Installation) error {
			return errors.New("brew uninstall failed: formula has dependents")
		}
		defer func() { mockInstallerUninstallHook = nil }()

		out, err := p.run("state", "cleanup")
		if err == nil {
			t.Fatalf("state cleanup succeeded despite uninstall failure\n%s", out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[orphan-brew] Failed to cleanup orphaned tool: ", "brew uninstall failed: formula has dependents")
		if rec := p.installation(t, "orphan-brew"); rec == nil {
			t.Fatal("orphan-brew must remain recorded when uninstall fails")
		}
	})

	t.Run("unknown recorded installer method fails and leaves orphan recorded", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"bat": `install("manual")`})
		method := "nonexistent-pkg-mgr"
		p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
			return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
				ToolName:        "orphan-custom",
				Version:         "v1.0.0",
				InstallPath:     filepath.Join(p.Root, "installed", "orphan-custom"),
				InstallMethod:   &method,
				BinaryPaths:     "[]",
				PackageIdentity: func() *string { value := `{"name":"actual-package"}`; return &value }(),
			})
		})

		out, err := p.run("state", "cleanup")
		if err == nil {
			t.Fatalf("state cleanup succeeded despite unknown installer\n%s", out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[orphan-custom] Failed to cleanup orphaned tool: ", "nonexistent-pkg-mgr")
		if rec := p.installation(t, "orphan-custom"); rec == nil {
			t.Fatal("orphan-custom must remain recorded when unknown installer fails")
		}
	})
}

func TestCleanupCommandDoesNotGuessPackageIdentity(t *testing.T) {
	for _, configured := range []bool{false, true} {
		t.Run(fmt.Sprintf("configured=%t", configured), func(t *testing.T) {
			tools := tsTools{}
			if configured {
				tools["alias"] = `install("brew", { formula: "real-package" }).disable()`
			}
			p := newE2EProject(t, tools)
			method := "brew"
			p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
				return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{ToolName: "alias", Version: "1", InstallPath: filepath.Join(p.Root, "installed", "alias"), BinaryPaths: "[]", InstallMethod: &method})
			})
			called := false
			mockInstallerUninstallHook = func(method string, tool *config.ToolConfig, installed installer.Installation) error {
				called = true
				if !configured || tool.InstallParams["formula"] != "real-package" {
					t.Fatalf("unsafe uninstall config: %+v", tool)
				}
				return nil
			}
			defer func() { mockInstallerUninstallHook = nil }()
			out, err := p.run("state", "cleanup")
			if err != nil {
				t.Fatalf("cleanup: %v\n%s", err, out.Combined)
			}
			if called != configured {
				t.Fatalf("installer called=%t, want %t", called, configured)
			}
			if !configured {
				mustContain(t, "stderr", out.Stderr, "The brew package it installed is left in place")
			}
			if p.installation(t, "alias") != nil {
				t.Fatal("installation record remains after cleanup")
			}
		})
	}
}
