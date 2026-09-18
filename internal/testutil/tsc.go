// Package testutil holds helpers shared by tests across packages.
package testutil

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// FindTypeScriptCompiler returns the native TypeScript 7 `tsc` executable the
// repository's dependencies provide for the current platform.
//
// `node_modules/.bin/tsc` is a Node.js launcher script, so tests use the platform
// package's binary directly, the same file `dotfiles install` unpacks from the
// typescript-go release for the scaffolded typescript tool. Bun lays the package out
// under `node_modules/.bun`, npm hoists it under `node_modules/@typescript`; both are
// looked in.
func FindTypeScriptCompiler(repoRoot string) (string, error) {
	pkg := fmt.Sprintf("typescript-%s-%s", nodePlatform(runtime.GOOS), nodeArch(runtime.GOARCH))
	patterns := []string{
		filepath.Join(repoRoot, "node_modules", "@typescript", pkg, "lib", "tsc"),
		filepath.Join(repoRoot, "node_modules", ".bun", "@typescript+"+pkg+"@*", "node_modules", "@typescript", pkg, "lib", "tsc"),
	}
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return "", fmt.Errorf("searching %s: %w", pattern, err)
		}
		for _, match := range matches {
			if info, err := os.Stat(match); err == nil && !info.IsDir() {
				return match, nil
			}
		}
	}
	return "", fmt.Errorf("no native TypeScript compiler for %s found under %s; run `bun install`", pkg, filepath.Join(repoRoot, "node_modules"))
}

// nodePlatform maps a GOOS value to the platform token the typescript packages use.
func nodePlatform(goos string) string {
	if goos == "windows" {
		return "win32"
	}
	return goos
}

// nodeArch maps a GOARCH value to the architecture token the typescript packages use.
func nodeArch(goarch string) string {
	if goarch == "amd64" {
		return "x64"
	}
	return goarch
}

// RepoRoot walks up from the working directory to the directory holding go.mod.
func RepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getting working directory: %w", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no go.mod found above %s", dir)
		}
		dir = parent
	}
}
