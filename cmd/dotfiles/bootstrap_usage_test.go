package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/usagelog"
)

func startupUsageFixture(t *testing.T) (string, string, time.Time) {
	t.Helper()
	t.Setenv("DEV_PROXY", "")
	if err := os.Unsetenv("DEV_PROXY"); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	configPath := writeTSProject(t, root, `"paths": {`+projectPathsTS(root)+`}`, tsTools{
		"bat": `install("manual").bin("bat")`,
	})
	generated := filepath.Join(root, "generated")
	marker := usagelog.MarkerPath(generated, "bat", "bat")
	if err := os.MkdirAll(filepath.Dir(marker), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(marker, nil, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(usagelog.Path(generated), []byte("v1\t1700000000\tbat\tbat\n"), 0644); err != nil {
		t.Fatal(err)
	}
	observed := time.Unix(1700000600, 0)
	if err := os.Chtimes(marker, observed, observed); err != nil {
		t.Fatal(err)
	}
	return configPath, generated, observed
}

func TestBootstrapUsageRefreshModes(t *testing.T) {
	for _, test := range []struct {
		name     string
		dry      bool
		inMemory bool
		skip     bool
	}{
		{name: "project startup"},
		{name: "explicit exclusion", skip: true},
		{name: "dry run", dry: true},
		{name: "in-memory execution", inMemory: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("DOTFILES_E2E_TEST", "true")
			if test.inMemory {
				t.Setenv("DOTFILES_E2E_TEST", "false")
			}
			previousDryRun := dryRun
			dryRun = test.dry
			t.Cleanup(func() { dryRun = previousDryRun })
			configPath, generated, observed := startupUsageFixture(t)
			ctx := context.Background()
			if test.skip {
				ctx = withoutStartupUsage(ctx)
			}
			services, err := BootstrapServices(ctx, configPath)
			if err != nil {
				t.Fatal(err)
			}
			defer services.Close()
			usage, err := services.Registry.GetToolUsage(ctx, "bat", "bat")
			if err != nil {
				t.Fatal(err)
			}
			if test.dry || test.inMemory || test.skip {
				if usage != nil {
					t.Fatalf("excluded startup imported usage: %+v", usage)
				}
			} else if usage == nil || usage.UsageCount != 0 || usage.LastUsedAt != observed.UnixMilli() {
				t.Fatalf("usage = %+v, want last use %d without a counter", usage, observed.UnixMilli())
			}
			if _, err := os.Stat(usagelog.MarkerPath(generated, "bat", "bat")); err != nil {
				t.Fatalf("startup removed persistent marker: %v", err)
			}
		})
	}
}

func TestCompletionDoesNotRefreshUsage(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	configPath, generated, _ := startupUsageFixture(t)
	output, err := runCommand("--config", configPath, "__complete", "tool", "info", "")
	if err != nil {
		t.Fatalf("completion failed: %v\n%s", err, output.Combined)
	}
	if !strings.Contains(output.Stdout, "bat") {
		t.Fatalf("completion did not load the project: %s", output.Combined)
	}
	database, err := db.NewConnection(context.Background(), filepath.Join(generated, "registry.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	usage, err := registry.NewRegistry(database).GetToolUsage(context.Background(), "bat", "bat")
	if err != nil || usage != nil {
		t.Fatalf("completion imported usage: %+v, %v", usage, err)
	}
}

func TestBootstrapUsageImportFailureDoesNotAbort(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	previousDryRun := dryRun
	dryRun = false
	t.Cleanup(func() { dryRun = previousDryRun })
	configPath, generated, _ := startupUsageFixture(t)
	brokenLog := filepath.Join(usagelog.Dir(generated), "shim-usage.log.1.7")
	if err := os.MkdirAll(brokenLog, 0755); err != nil {
		t.Fatal(err)
	}
	services, err := BootstrapServices(context.Background(), configPath)
	if err != nil {
		t.Fatalf("usage import prevented command bootstrap: %v", err)
	}
	defer services.Close()
	if _, err := os.Stat(brokenLog); err != nil {
		t.Fatalf("failed import removed its source: %v", err)
	}
}
