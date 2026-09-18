package e2e

import (
	"strings"
	"testing"
)

// A configuration file that exports no configuration is a configuration error: every
// command goes through the same bootstrap, so the one that reports it has to name the
// file and exit non-zero rather than dereference a configuration that is not there.
func TestE2EConfigurationFileExportsNoConfiguration(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigContent: "export default undefined;\n"})

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if strings.Contains(output, "panic:") || strings.Contains(output, "goroutine 1 [running]") {
		t.Fatalf("expected a configuration error rather than a stack trace:\n%s", output)
	}
	if !strings.Contains(output, h.ConfigPath) {
		t.Errorf("expected the failure to name %q:\n%s", h.ConfigPath, output)
	}
	if !strings.Contains(output, "must export a configuration object") {
		t.Errorf("expected the failure to say what the file must export:\n%s", output)
	}
}
