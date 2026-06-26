package e2e

import (
	"testing"
)

func TestE2ECompletion(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL

	// Copy the "main" fixture files to the sandbox TempDir
	h.CopyFixture("main")

	// Run generate command
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify shim was created
	h.AssertShimExistsAndExecutable("curl-script--cmd-completion-test")

	// Install the tool explicitly
	stdout, stderr, exitCode, err = h.Install([]string{"curl-script--cmd-completion-test"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify completion files were generated
	zshCompletionPath := ".generated/shell-scripts/zsh/completions/_curl-script--cmd-completion-test"
	bashCompletionPath := ".generated/shell-scripts/bash/completions/curl-script--cmd-completion-test"

	h.AssertFileExists(zshCompletionPath)
	h.AssertFileExists(bashCompletionPath)

	// Verify completion content contains expected strings
	h.AssertFileContentContains(zshCompletionPath, "#compdef curl-script--cmd-completion-test")
	h.AssertFileContentContains(zshCompletionPath, "_curl-script--cmd-completion-test")

	h.AssertFileContentContains(bashCompletionPath, "_curl_script_cmd_completion_test")
	h.AssertFileContentContains(bashCompletionPath, "complete -F _curl_script_cmd_completion_test")
}
