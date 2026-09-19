package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EDiff(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.CopyFixture("main")

	// Create a tool with a managed block and template
	declToolPath := filepath.Join(h.TempDir, "tools", "decl-tool.tool.ts")
	_ = os.WriteFile(declToolPath, []byte(`
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install("manual")
    .ensureDir("~/.ssh", { mode: "0700" })
    .block("~/.ssh/config", {
      id: "personal-hosts",
      mode: "0600",
      content: "Host my-server\n  HostName 10.0.0.1",
    })
    .template("./app.template", "~/.config/app/settings.conf", {
      variables: { envName: "production" },
    }),
);
`), 0644)

	templatePath := filepath.Join(h.TempDir, "tools", "app.template")
	_ = os.WriteFile(templatePath, []byte("environment = {envName}\nport = 8080\n"), 0644)

	t.Run("diff shows drift before generate", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("diff", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("diff command failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "decl-tool") {
			t.Errorf("expected diff to list decl-tool before generate, got:\n%s", stdout)
		}
	})

	t.Run("diff shows in-sync after generate", func(t *testing.T) {
		_, _, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed")
		}

		stdout, stderr, exitCode, err := h.RunCommand("diff", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("diff command failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "in-sync") {
			t.Errorf("expected in-sync message, got:\n%s", stdout)
		}
	})

	t.Run("diff detects local disk modifications and displays diffs", func(t *testing.T) {
		// Modify the template target on disk
		settingsPath := filepath.Join(h.TempDir, ".generated", "user-home", ".config", "app", "settings.conf")
		_ = os.WriteFile(settingsPath, []byte("environment = production\nport = 9090\n"), 0644)

		stdout, stderr, exitCode, err := h.RunCommand("diff", "decl-tool", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("diff command failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, "decl-tool") || !strings.Contains(stdout, "settings.conf") {
			t.Errorf("expected diff to report modified settings.conf, got:\n%s", stdout)
		}
		if !strings.Contains(stdout, "-port = 9090") || !strings.Contains(stdout, "+port = 8080") {
			t.Errorf("expected unified diff output showing modified port, got:\n%s", stdout)
		}
	})

	t.Run("diff --json outputs structured drift data", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("diff", "--json", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("diff --json failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, `"hasDrift": true`) {
			t.Errorf("expected JSON with hasDrift true, got:\n%s", stdout)
		}
		if !strings.Contains(stdout, `"template"`) || !strings.Contains(stdout, `"local-drift"`) {
			t.Errorf("expected JSON to include template with local-drift state, got:\n%s", stdout)
		}
	})

	t.Run("diff in agent mode (AGENT=1) outputs compact format", func(t *testing.T) {
		hAgent := NewTestHarness(t, HarnessOptions{
			ConfigPath: h.ConfigPath,
			Env: map[string]string{
				"AGENT": "1",
			},
		})

		stdout, stderr, exitCode, err := hAgent.RunCommand("diff", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("diff in agent mode failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, "DRIFT: tool:decl-tool") {
			t.Errorf("expected agent mode DRIFT line, got:\n%s", stdout)
		}
	})
}
