package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EDependencyResolution(t *testing.T) {
	t.Parallel()

	t.Run("generates successfully when dependencies are satisfied", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
		})
		h.CopyFixture("dependency-success")

		_, _, exitCode, err := h.Generate("-d")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if exitCode != 0 {
			t.Fatalf("expected generate to succeed, but got exit code %d", exitCode)
		}
	})

	t.Run("fails when a dependency provider is missing", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
		})
		h.CopyFixture("dependency-missing")

		stdout, stderr, exitCode, err := h.Generate("-d")
		if err == nil && exitCode == 0 {
			t.Fatalf("expected generate to fail, but succeeded")
		}

		output := stdout + stderr
		if !strings.Contains(output, "depends on missing dependency") && !strings.Contains(output, "requires binary") {
			t.Fatalf("expected output to mention missing dependency, but got:\n%s", output)
		}
		if !strings.Contains(output, "missing-provider") {
			t.Fatalf("expected output to mention missing-provider, but got:\n%s", output)
		}
	})

	t.Run("fails when multiple tools provide the same dependency", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
		})
		h.CopyFixture("dependency-ambiguous")

		stdout, stderr, exitCode, err := h.Generate("-d")
		if err == nil && exitCode == 0 {
			t.Fatalf("expected generate to fail, but succeeded")
		}

		output := stdout + stderr
		if !strings.Contains(output, "ambiguous dependency") && !strings.Contains(output, "provided by multiple tools") {
			t.Fatalf("expected output to mention ambiguous dependency, but got:\n%s", output)
		}
		if !strings.Contains(output, "shared-dependency") {
			t.Fatalf("expected output to mention shared-dependency, but got:\n%s", output)
		}
	})

	t.Run("fails when dependencies create a cycle", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
		})
		h.CopyFixture("dependency-circular")

		stdout, stderr, exitCode, err := h.Generate("-d")
		if err == nil && exitCode == 0 {
			t.Fatalf("expected generate to fail, but succeeded")
		}

		output := stdout + stderr
		if !strings.Contains(output, "cycle") && !strings.Contains(output, "detected") {
			t.Fatalf("expected output to mention circular dependency, but got:\n%s", output)
		}
		if !strings.Contains(output, "dependency-cycle-a") || !strings.Contains(output, "dependency-cycle-b") {
			t.Fatalf("expected output to mention cycle members, but got:\n%s", output)
		}
	})

	t.Run("fails when the dependency provider is unavailable on the active platform", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
		})
		h.CopyFixture("dependency-platform-mismatch")

		stdout, stderr, exitCode, err := h.Generate("-d")
		if err == nil && exitCode == 0 {
			t.Fatalf("expected generate to fail, but succeeded")
		}

		output := stdout + stderr
		if !strings.Contains(output, "depends on missing dependency") && !strings.Contains(output, "requires binary") {
			t.Fatalf("expected output to mention missing dependency, but got:\n%s", output)
		}
	})
}

// A dependency on a disabled tool's binary is a reference the generated bin-name
// registry accepts, so it must load: the run carries on without the disabled provider
// and generates every other tool, including ones with no part in the dependency.
func TestE2EDependencyOnDisabledProvider(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("dependency-disabled-provider")

	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
};`
	if err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("expected generate to succeed, got exit code %d, err %v\nstdout: %s\nstderr: %s", exitCode, err, stdout, stderr)
	}

	output := stdout + stderr
	if !strings.Contains(output, `provided by disabled tool "provider"`) {
		t.Errorf("expected the run to name the disabled provider, but got:\n%s", output)
	}
	if strings.Contains(output, "missing dependency") {
		t.Errorf("expected the disabled provider not to be reported as missing, but got:\n%s", output)
	}

	h.AssertShimExistsAndExecutable("unrelated-bin")
	h.AssertShimExistsAndExecutable("consumer-bin")

	if _, err := os.Stat(filepath.Join(h.TempDir, ".generated", "user-bin", "provider-bin")); !os.IsNotExist(err) {
		t.Errorf("expected no shim for the disabled provider's binary (err=%v)", err)
	}
}
