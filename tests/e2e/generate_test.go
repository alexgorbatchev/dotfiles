package e2e

import (
	"testing"
)

func TestE2EGenerate(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	// Copy the "main" fixture files to the sandbox TempDir
	h.CopyFixture("main")

	// Run generate command
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if exitCode != 0 {
		t.Fatalf("generate returned exit code %d, stdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	t.Run("should generate directories", func(t *testing.T) {
		h.AssertFileExists(".generated/user-bin")
		h.AssertFileExists(".generated/shell-scripts")
	})

	t.Run("github-release-tool", func(t *testing.T) {
		h.AssertShimExistsAndExecutable("github-release-tool")
		h.AssertShellInitContains("zsh", "github-release-tool")
		h.AssertShellInitContains("bash", "export PATH=")
		h.AssertShellInitContains("powershell", "$env:PATH")

		h.AssertEnvironmentVariable("github-release-tool", "GITHUB_RELEASE_TOOL_DEFAULT_OPTS", "--color=fg")
		h.AssertEnvironmentVariable("github-release-tool", "GITHUB_RELEASE_TOOL_OTHER_OPTS", "--arg=1")

		h.AssertAlias("github-release-tool", "grt", `github-release-tool --preview "ps -f -p {+}"`)

		h.AssertAlwaysScriptContains("github-release-tool", `echo "always from github-release-tool"`)
		h.AssertOnceScriptContains("github-release-tool", `echo "echo from github-release-tool"`)

		h.AssertShellInitContains("zsh", "completions")
	})

	t.Run("cargo-quickinstall-tool", func(t *testing.T) {
		h.AssertShimExistsAndExecutable("cargo-quickinstall-tool")

		h.AssertEnvironmentVariable("cargo-quickinstall-tool", "CARGO_QUICKINSTALL_TOOL_DEFAULT_OPTS", "--color=fg")
		h.AssertEnvironmentVariable("cargo-quickinstall-tool", "CARGO_QUICKINSTALL_TOOL_OTHER_OPTS", "--arg=1")

		h.AssertAlias("cargo-quickinstall-tool", "cqt", `cargo-quickinstall-tool --preview "ps -f -p {+}"`)

		h.AssertAlwaysScriptContains("cargo-quickinstall-tool", `echo "always from cargo-quickinstall-tool"`)
		h.AssertOnceScriptContains("cargo-quickinstall-tool", `echo "once from cargo-quickinstall-tool"`)
	})
}
