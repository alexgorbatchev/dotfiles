//go:build buildtest

package main

import "testing"

// TestRunBuild performs the real release build: it regenerates the embedded
// assets in the source tree, cross-compiles every target and packages the
// archives. That makes it a build rather than a test, and it cannot run as part
// of the ordinary suite for two reasons. It rewrites generated files that are
// committed, and every package whose tests load a TypeScript configuration
// records the repository root as an input -- Go hashes each entry's modification
// time -- so rewriting .dist and .tmp there stops pkg/installer, pkg/scaffold,
// pkg/vm and cmd/dotfiles from ever reusing a cached result.
//
// It is kept behind the `buildtest` tag and run by `just test-build`, which
// `just check` includes, so the full build is still verified on every check and
// in CI.
func TestRunBuild(t *testing.T) {
	if err := runBuild(); err != nil {
		t.Fatalf("runBuild failed: %v", err)
	}
}
