package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestGenerateCommand_WritesCLICompletion covers the wiring in generate.go: after
// tool generation the CLI's own zsh completion lands where main.zsh puts fpath.
func TestGenerateCommand_WritesCLICompletion(t *testing.T) {
	p := newE2EProject(t, tsTools{"manual-tool": `install("manual")`})

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("generate: %v\n%s", err, out.Combined)
	}

	completionPath := filepath.Join(p.GeneratedDir, "shell-scripts", "zsh", "completions", "_dotfiles")
	script, err := os.ReadFile(completionPath)
	if err != nil {
		t.Fatalf("reading %s: %v\n%s", completionPath, err, out.Combined)
	}
	if !strings.HasPrefix(string(script), "#compdef dotfiles\n") {
		t.Fatalf("%s does not start with cobra's compdef header:\n%.120s", completionPath, script)
	}

	mainZsh, err := os.ReadFile(filepath.Join(p.GeneratedDir, "shell-scripts", "main.zsh"))
	if err != nil {
		t.Fatalf("reading main.zsh: %v", err)
	}
	if !strings.Contains(string(mainZsh), filepath.Dir(completionPath)) {
		t.Fatalf("main.zsh does not put %s on fpath:\n%s", filepath.Dir(completionPath), mainZsh)
	}
}

// shellInstallFeature configures every shell's profile under the project HOME.
const shellInstallFeature = `"features": {"shellInstall": {"zsh": "~/.zshrc", "bash": "~/.bashrc", "powershell": "~/.config/powershell/profile.ps1"}}`

// shellInstallProfiles maps each configured profile (relative to HOME) to the
// generated script it must source.
var shellInstallProfiles = map[string]string{
	".zshrc":                         "main.zsh",
	".bashrc":                        "main.bash",
	".config/powershell/profile.ps1": "main.ps1",
}

func TestGenerateCommand_UpdatesExistingProfiles(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install()`})
	p.writeConfig(t, tsTools{"bat": `install()`}, "", shellInstallFeature)
	const userSettings = "# user settings\nexport EDITOR=vim\n"
	for rel := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		if err := os.MkdirAll(filepath.Dir(profile), 0755); err != nil {
			t.Fatalf("creating %s: %v", filepath.Dir(profile), err)
		}
		if err := os.WriteFile(profile, []byte(userSettings), 0644); err != nil {
			t.Fatalf("writing %s: %v", profile, err)
		}
	}

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("state generate: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "Integrating generated shell scripts with profiles")
	if strings.Contains(out.Stderr, "Profile not found") {
		t.Fatalf("existing profiles were reported as missing:\n%s", out.Stderr)
	}

	for rel, script := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		data, err := os.ReadFile(profile)
		if err != nil {
			t.Fatalf("reading %s: %v", profile, err)
		}
		mustContain(t, rel, string(data), userSettings, "# Generated via dotfiles generator - do not modify", script)
		info, err := os.Stat(profile)
		if err != nil {
			t.Fatalf("stat %s: %v", profile, err)
		}
		if perm := info.Mode().Perm(); perm != 0644 {
			t.Errorf("%s permissions = %#o after generate, want the original 0644", rel, perm)
		}
	}
}

func TestGenerateCommand_SkipsMissingProfiles(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install()`})
	p.writeConfig(t, tsTools{"bat": `install()`}, "", shellInstallFeature)

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("state generate: %v\n%s", err, out.Combined)
	}

	for rel, script := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		if _, err := os.Stat(profile); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s must not be created by generate (stat error = %v)", profile, err)
		}
		mustContain(t, "stderr", out.Stderr, profile, "Profile not found, skipping", script)
	}
}

// TestGenerateCommand_FailureLogsNameTheCause pins that the failures generate logs
// without failing, a profile it cannot update and a CLI completion it cannot write, are
// reported with their cause outside --trace (#131).
func TestGenerateCommand_FailureLogsNameTheCause(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install()`})
	p.writeConfig(t, tsTools{"bat": `install()`}, "", `"features": {"shellInstall": {"zsh": "~/.zshrc"}}`)
	// A directory where each file belongs cannot be read or written as one.
	profile := filepath.Join(p.HomeDir, ".zshrc")
	completion := filepath.Join(p.GeneratedDir, "shell-scripts", "zsh", "completions", "_dotfiles")
	for _, dir := range []string{profile, completion} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("state generate: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr,
		// The prefixes are the wrapped errors the failures return, so a cause follows.
		"["+profile+"] Failed shell profile injection: reading profile path: ",
		"Failed to write CLI completion: writing CLI completion: ",
	)
}
