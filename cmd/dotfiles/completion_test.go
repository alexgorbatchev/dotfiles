package main

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// createCompletionConfigDir writes a three-tool fixture so tests can assert on
// prefix filtering, on exclusion of already-typed tool names, and on a tool whose
// only binary shares its name (brew), which `bin` completion must not list twice.
func createCompletionConfigDir(t *testing.T) {
	t.Helper()
	tmpDir := enterTempDir(t)

	writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`, tsTools{
		"brew":                `install("manual")`,
		"github-release--bat": `install("github-release", { repo: "sharkdp/bat" }).bin("bat")`,
		"github-release--fd":  `install("github-release", { repo: "sharkdp/fd" }).bin("fd")`,
	})
}

// parseCompletionOutput splits cobra's __complete stdout into candidate names
// (descriptions after the tab are dropped) and the trailing ":N" directive line.
func parseCompletionOutput(t *testing.T, stdout string) ([]string, cobra.ShellCompDirective) {
	t.Helper()
	lines := strings.Split(strings.TrimRight(stdout, "\n"), "\n")
	var directive int
	if _, err := fmt.Sscanf(lines[len(lines)-1], ":%d", &directive); err != nil {
		t.Fatalf("__complete stdout does not end with a directive line:\n%s", stdout)
	}
	candidates := []string{}
	for _, line := range lines[:len(lines)-1] {
		// Cobra prefixes ActiveHelp lines with "_activeHelp_"; only real candidates matter here.
		if strings.HasPrefix(line, "_activeHelp_") {
			continue
		}
		name, _, _ := strings.Cut(line, "\t")
		candidates = append(candidates, name)
	}
	return candidates, cobra.ShellCompDirective(directive)
}

func assertCandidates(t *testing.T, got []string, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("candidates = %v, want %v", got, want)
	}
}

func TestCompletion_ToolNamePositionalArgs(t *testing.T) {
	createCompletionConfigDir(t)

	allTools := []string{"brew", "github-release--bat", "github-release--fd"}

	tests := []struct {
		name           string
		args           []string
		wantCandidates []string
	}{
		{"install first arg", []string{"tool", "install", ""}, allTools},
		{"update first arg", []string{"tool", "update", ""}, allTools},
		{"uninstall first arg", []string{"tool", "uninstall", ""}, allTools},
		{"which first arg", []string{"tool", "which", ""}, []string{"bat", "brew", "fd", "github-release--bat", "github-release--fd"}},
		{"files first arg", []string{"tool", "files", ""}, allTools},
		{"log first arg", []string{"state", "log", ""}, allTools},
		{"validate first arg", []string{"tool", "validate", ""}, allTools},
		{"prefix filters candidates", []string{"tool", "install", "github-release--b"}, []string{"github-release--bat"}},
		{"install excludes tools already on the line", []string{"tool", "install", "github-release--bat", ""}, []string{"brew", "github-release--fd"}},
		{"install treats KEY=VALUE as not a tool", []string{"tool", "install", "FOO=1", ""}, allTools},
		{"which accepts a single tool only", []string{"tool", "which", "github-release--bat", ""}, []string{}},
		{"files accepts a single tool only", []string{"tool", "files", "github-release--bat", ""}, []string{}},
		{"log accepts a single tool only", []string{"state", "log", "github-release--bat", ""}, []string{}},
		{"validate accepts a single tool only", []string{"tool", "validate", "github-release--bat", ""}, []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand(append([]string{cobra.ShellCompRequestCmd}, tt.args...)...)
			if err != nil {
				t.Fatalf("__complete %v returned error: %v\n%s", tt.args, err, out.Combined)
			}
			got, directive := parseCompletionOutput(t, out.Stdout)
			assertCandidates(t, got, tt.wantCandidates)
			if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
				t.Fatalf("directive = %d, want ShellCompDirectiveNoFileComp set so the shell never falls back to file names", directive)
			}
			// Cobra's trailing debug line belongs on stderr; stdout must carry only what the shell parses.
			if !strings.Contains(out.Stderr, "Completion ended with directive") {
				t.Fatalf("stderr = %q, want cobra's completion debug line there and not on stdout", out.Stderr)
			}
		})
	}
}

func TestCompletion_BinAcceptsBinaryOrToolName(t *testing.T) {
	createCompletionConfigDir(t)

	out, err := runCommand(cobra.ShellCompRequestCmd, "tool", "which", "")
	if err != nil {
		t.Fatalf("__complete tool which returned error: %v\n%s", err, out.Combined)
	}
	got, directive := parseCompletionOutput(t, out.Stdout)
	// brew appears once even though it is both a tool name and that tool's implicit binary.
	assertCandidates(t, got, []string{"bat", "brew", "fd", "github-release--bat", "github-release--fd"})
	if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
		t.Fatalf("directive = %d, want ShellCompDirectiveNoFileComp set", directive)
	}

	out, err = runCommand(cobra.ShellCompRequestCmd, "tool", "which", "bat", "")
	if err != nil {
		t.Fatalf("__complete tool which bat returned error: %v\n%s", err, out.Combined)
	}
	got, _ = parseCompletionOutput(t, out.Stdout)
	assertCandidates(t, got, []string{})

	// path get completion offers the supported path names
	out, err = runCommand(cobra.ShellCompRequestCmd, "path", "get", "")
	if err != nil {
		t.Fatalf("__complete path get returned error: %v\n%s", err, out.Combined)
	}
	got, _ = parseCompletionOutput(t, out.Stdout)
	assertCandidates(t, got, []string{"binaries", "cache", "dotfiles", "generated", "home", "shellScripts", "target", "toolConfigs"})
}

func TestCompletion_ConfigLoadFailureReportsError(t *testing.T) {
	createCompletionConfigDir(t)
	missingConfig := filepath.Join(t.TempDir(), "missing.config.ts")

	for _, sub := range [][]string{{"tool", "install"}, {"tool", "which"}} {
		t.Run(strings.Join(sub, " "), func(t *testing.T) {
			args := append([]string{"--config", missingConfig, cobra.ShellCompRequestCmd}, sub...)
			args = append(args, "")
			out, err := runCommand(args...)
			if err != nil {
				t.Fatalf("__complete must never fail the process, got error: %v\n%s", err, out.Combined)
			}
			got, directive := parseCompletionOutput(t, out.Stdout)
			assertCandidates(t, got, []string{})
			if directive&cobra.ShellCompDirectiveError == 0 {
				t.Fatalf("directive = %d, want ShellCompDirectiveError so the shell discards the result", directive)
			}
		})
	}
}

// TestCompletion_DescribesInstallationMethod checks the raw candidate line, since
// parseCompletionOutput drops descriptions: shells that render them (zsh, fish)
// show where each tool comes from.
func TestCompletion_DescribesInstallationMethod(t *testing.T) {
	createCompletionConfigDir(t)

	out, err := runCommand(cobra.ShellCompRequestCmd, "tool", "install", "")
	if err != nil {
		t.Fatalf("__complete tool install returned error: %v\n%s", err, out.Combined)
	}
	for _, want := range []string{"brew\tmanual\n", "github-release--bat\tgithub-release\n"} {
		if !strings.Contains(out.Stdout, want) {
			t.Fatalf("stdout = %q, want candidate line %q", out.Stdout, want)
		}
	}
}
