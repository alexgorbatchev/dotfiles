package e2e

import (
	"regexp"
	"strings"
	"testing"
)

func TestE2ETrace(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("main")

	t.Run("should show file paths when --trace is used", func(t *testing.T) {
		// Run generate with --trace
		_, stderr, exitCode, err := h.Generate("-d", "--trace")
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstderr: %s", err, stderr)
		}

		// Verify output contains .go:line locations (e.g. generate.go:20)
		re := regexp.MustCompile(`[\w-]+\.go:\d+`)
		if !re.MatchString(stderr) {
			t.Fatalf("expected output to contain Go source trace location, but got:\n%s", stderr)
		}
	})

	t.Run("should NOT show file paths when --trace is NOT used", func(t *testing.T) {
		// Run generate without --trace
		_, stderr, exitCode, err := h.Generate("-d")
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstderr: %s", err, stderr)
		}

		// Verify output does NOT contain .go:line locations
		re := regexp.MustCompile(`[\w-]+\.go:\d+`)
		if re.MatchString(stderr) {
			t.Fatalf("expected output NOT to contain Go source trace location, but got:\n%s", stderr)
		}
	})

	t.Run("should NOT show anything when --log quiet is used", func(t *testing.T) {
		// Run generate with --log quiet
		_, stderr, exitCode, err := h.Generate("-d", "--log", "quiet")
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstderr: %s", err, stderr)
		}

		if strings.TrimSpace(stderr) != "" {
			t.Fatalf("expected quiet output to be empty, but got:\n%s", stderr)
		}
	})
}
