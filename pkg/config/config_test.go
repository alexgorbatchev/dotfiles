package config

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// TestToolConfigUnmarshalJSONInstallParamDefaults asserts that decoding a tool
// configuration fills in the installation method's parameter defaults exactly
// the way the method's v1 schema did, without overriding explicit values.
func TestToolConfigUnmarshalJSONInstallParamDefaults(t *testing.T) {
	tests := []struct {
		name     string
		in       string
		wantAuto interface{}
		wantKey  bool
	}{
		{
			name:     "zsh-plugin omitted auto defaults to true",
			in:       `{"name":"zvm","installationMethod":"zsh-plugin","installParams":{"repo":"jeffreytse/zsh-vi-mode"}}`,
			wantAuto: true,
			wantKey:  true,
		},
		{
			name:     "zsh-plugin explicit true is kept",
			in:       `{"name":"zvm","installationMethod":"zsh-plugin","installParams":{"repo":"jeffreytse/zsh-vi-mode","auto":true}}`,
			wantAuto: true,
			wantKey:  true,
		},
		{
			name:     "zsh-plugin explicit false is kept",
			in:       `{"name":"zvm","installationMethod":"zsh-plugin","installParams":{"repo":"jeffreytse/zsh-vi-mode","auto":false}}`,
			wantAuto: false,
			wantKey:  true,
		},
		{
			name:     "zsh-plugin without installParams still gets the default",
			in:       `{"name":"zvm","installationMethod":"zsh-plugin"}`,
			wantAuto: true,
			wantKey:  true,
		},
		{
			name:    "other methods get no auto default",
			in:      `{"name":"rg","installationMethod":"github-release","installParams":{"repo":"BurntSushi/ripgrep"}}`,
			wantKey: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var tc ToolConfig
			if err := json.Unmarshal([]byte(tt.in), &tc); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			got, ok := tc.InstallParams["auto"]
			if ok != tt.wantKey {
				t.Fatalf("auto present = %v, want %v (params: %v)", ok, tt.wantKey, tc.InstallParams)
			}
			if tt.wantKey && got != tt.wantAuto {
				t.Fatalf("auto = %v, want %v", got, tt.wantAuto)
			}
		})
	}
}

// TestToolConfigUnmarshalJSONRejectsUnknownFields keeps the decoding contract
// strict: a misspelled tool property is an error, not a silent no-op.
func TestToolConfigUnmarshalJSONRejectsUnknownFields(t *testing.T) {
	var tc ToolConfig
	err := json.Unmarshal([]byte(`{"name":"rg","instalationMethod":"brew"}`), &tc)
	if err == nil {
		t.Fatal("expected unknown field error, got nil")
	}
	if !strings.Contains(err.Error(), "instalationMethod") {
		t.Fatalf("expected error to name the unknown field, got: %v", err)
	}
}

func TestCacheConfigIsEnabled(t *testing.T) {
	on, off := true, false

	tests := []struct {
		name string
		cfg  CacheConfig
		want bool
	}{
		// A configuration that says nothing about the cache asks for the default,
		// which is on; Go's zero value for bool is false, which is why the field is
		// a pointer rather than a plain bool.
		{name: "key left out", cfg: CacheConfig{}, want: true},
		{name: "enabled: true", cfg: CacheConfig{Enabled: &on}, want: true},
		{name: "enabled: false", cfg: CacheConfig{Enabled: &off}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.IsEnabled(); got != tt.want {
				t.Errorf("IsEnabled() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestToolConfigUpdateCheckAccessors(t *testing.T) {
	on, off := true, false
	constraint, empty := "~1.2.0", ""

	tests := []struct {
		name           string
		updateCheck    *ToolConfigUpdateCheck
		wantEnabled    bool
		wantConstraint string
	}{
		// A tool that says nothing about update checks is checked, and bounds nothing.
		// Go's zero value for bool is false, which is why both fields are pointers.
		{name: "no updateCheck block", updateCheck: nil, wantEnabled: true},
		{name: "empty updateCheck block", updateCheck: &ToolConfigUpdateCheck{}, wantEnabled: true},
		{name: "enabled: true", updateCheck: &ToolConfigUpdateCheck{Enabled: &on}, wantEnabled: true},
		{name: "enabled: false", updateCheck: &ToolConfigUpdateCheck{Enabled: &off}, wantEnabled: false},
		{name: "constraint", updateCheck: &ToolConfigUpdateCheck{Constraint: &constraint}, wantEnabled: true, wantConstraint: constraint},
		{name: "empty constraint", updateCheck: &ToolConfigUpdateCheck{Constraint: &empty}, wantEnabled: true},
		{
			name:           "both fields",
			updateCheck:    &ToolConfigUpdateCheck{Enabled: &off, Constraint: &constraint},
			wantEnabled:    false,
			wantConstraint: constraint,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tc := &ToolConfig{Name: "tool", UpdateCheck: tt.updateCheck}
			if got := tc.UpdateCheckEnabled(); got != tt.wantEnabled {
				t.Errorf("UpdateCheckEnabled() = %v, want %v", got, tt.wantEnabled)
			}
			if got := tc.UpdateCheckConstraint(); got != tt.wantConstraint {
				t.Errorf("UpdateCheckConstraint() = %q, want %q", got, tt.wantConstraint)
			}
		})
	}
}

// TestToolConfigRequestedVersion pins which setting names the version an installation
// asks for. The methods whose installers read a `version` install parameter
// (github-release, gitea-release, apt, dnf, pacman, npm), and dmg/pkg through the
// `version` of a github-release source, let it win over .version(); every other method
// requests .version(), so a stray `version` parameter there names nothing.
func TestToolConfigRequestedVersion(t *testing.T) {
	githubSource := func(version any) map[string]any {
		return map[string]any{"source": map[string]any{"type": "github-release", "repo": "acme/app", "version": version}}
	}
	tests := []struct {
		name      string
		method    string
		version   *string
		params    map[string]any
		want      string
		wantParam string
	}{
		{name: "nothing set", method: "github-release"},
		{name: ".version() alone", method: "github-release", version: new("v1.0.0"), want: "v1.0.0"},
		{name: "github-release install parameter", method: "github-release", params: map[string]any{"version": "v2.1.0"}, want: "v2.1.0", wantParam: "version"},
		{name: "the install parameter wins over .version()", method: "github-release", version: new("v1.0.0"), params: map[string]any{"version": "v2.1.0"}, want: "v2.1.0", wantParam: "version"},
		{name: "an install parameter of latest wins over .version()", method: "github-release", version: new("v1.0.0"), params: map[string]any{"version": "latest"}, want: "latest", wantParam: "version"},
		{name: "an empty install parameter falls back to .version()", method: "github-release", version: new("v1.0.0"), params: map[string]any{"version": ""}, want: "v1.0.0"},
		{name: "a non-string install parameter names nothing", method: "github-release", version: new("v1.0.0"), params: map[string]any{"version": 2}, want: "v1.0.0"},
		{name: "gitea-release install parameter", method: "gitea-release", params: map[string]any{"version": "v3.0.0"}, want: "v3.0.0", wantParam: "version"},
		{name: "apt install parameter", method: "apt", params: map[string]any{"version": "13.0.0-1"}, want: "13.0.0-1", wantParam: "version"},
		{name: "dnf install parameter", method: "dnf", params: map[string]any{"version": "13.0.0-1.fc40"}, want: "13.0.0-1.fc40", wantParam: "version"},
		{name: "pacman install parameter", method: "pacman", params: map[string]any{"version": "13.0.0-1"}, want: "13.0.0-1", wantParam: "version"},
		{name: "npm install parameter", method: "npm", params: map[string]any{"version": "3.0.0"}, want: "3.0.0", wantParam: "version"},
		{name: "uv install parameter", method: "uv", params: map[string]any{"version": "0.26.0"}, want: "0.26.0", wantParam: "version"},
		{name: "uv version operator install parameter", method: "uv", params: map[string]any{"version": ">=0.26.0"}, want: ">=0.26.0", wantParam: "version"},
		{name: "dmg github-release source", method: "dmg", version: new("v1.0.0"), params: githubSource("v2.0.0"), want: "v2.0.0", wantParam: "source.version"},
		{name: "pkg github-release source", method: "pkg", params: githubSource("v2.0.0"), want: "v2.0.0", wantParam: "source.version"},
		{name: "dmg url source has no version to name", method: "dmg", version: new("v1.0.0"), params: map[string]any{"source": map[string]any{"type": "url", "url": "https://example.test/app.dmg", "version": "v2.0.0"}}, want: "v1.0.0"},
		{name: "dmg ignores a top-level version parameter", method: "dmg", params: map[string]any{"version": "v2.0.0", "url": "https://example.test/app.dmg"}},
		{name: "cargo requests .version() alone", method: "cargo", version: new("1.0.0"), params: map[string]any{"version": "2.0.0"}, want: "1.0.0"},
		{name: "manual ignores a version parameter", method: "manual", params: map[string]any{"version": "2.0.0"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tc := &ToolConfig{Name: "tool", InstallationMethod: tt.method, Version: tt.version, InstallParams: tt.params}
			if got := tc.RequestedVersion(); got != tt.want {
				t.Errorf("RequestedVersion() = %q, want %q", got, tt.want)
			}
			if got, param := tc.requestedVersion(); got != tt.want || param != tt.wantParam {
				t.Errorf("requestedVersion() = (%q, %q), want (%q, %q)", got, param, tt.want, tt.wantParam)
			}
		})
	}
}

// TestToolConfigWithRequestedVersion pins that the version an update installs is
// written where RequestedVersion reads it, so the installer installs exactly that
// version even when an install parameter says "latest", and that it is written on a
// copy: the loaded configuration keeps what the user wrote, so a later update of the
// same tool is not refused as pinned to the version this one installed.
func TestToolConfigWithRequestedVersion(t *testing.T) {
	githubSource := func(version string) map[string]any {
		return map[string]any{"type": "github-release", "repo": "acme/app", "version": version}
	}
	tests := []struct {
		name       string
		method     string
		params     map[string]any
		wantParams map[string]any
	}{
		{name: "no install parameters", method: "github-release"},
		{
			name:       "a version install parameter of latest is replaced",
			method:     "github-release",
			params:     map[string]any{"repo": "acme/tool", "version": "latest"},
			wantParams: map[string]any{"repo": "acme/tool", "version": "v9.9.9"},
		},
		{
			name:       "without a version parameter .version() carries it",
			method:     "npm",
			params:     map[string]any{"package": "prettier"},
			wantParams: map[string]any{"package": "prettier"},
		},
		{
			name:       "a uv version parameter of latest is replaced",
			method:     "uv",
			params:     map[string]any{"package": "claude-swap", "version": "latest"},
			wantParams: map[string]any{"package": "claude-swap", "version": "v9.9.9"},
		},
		{
			name:       "a dmg github-release source version is replaced",
			method:     "dmg",
			params:     map[string]any{"appName": "App.app", "source": githubSource("latest")},
			wantParams: map[string]any{"appName": "App.app", "source": githubSource("v9.9.9")},
		},
		{
			name:       "a dmg url source is left alone",
			method:     "dmg",
			params:     map[string]any{"source": map[string]any{"type": "url", "url": "https://example.test/app.dmg"}},
			wantParams: map[string]any{"source": map[string]any{"type": "url", "url": "https://example.test/app.dmg"}},
		},
		{
			name:       "cargo gains no version parameter it never reads",
			method:     "cargo",
			params:     map[string]any{"crateName": "tool"},
			wantParams: map[string]any{"crateName": "tool"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before, err := json.Marshal(tt.params)
			if err != nil {
				t.Fatalf("encoding params: %v", err)
			}
			loaded := &ToolConfig{Name: "tool", InstallationMethod: tt.method, Version: new("latest"), InstallParams: tt.params}

			targeted := loaded.WithRequestedVersion("v9.9.9")

			if got := targeted.RequestedVersion(); got != "v9.9.9" {
				t.Errorf("targeted RequestedVersion() = %q, want v9.9.9", got)
			}
			if targeted.Version == nil || *targeted.Version != "v9.9.9" {
				t.Errorf("targeted Version = %v, want v9.9.9", targeted.Version)
			}
			got, _ := json.Marshal(targeted.InstallParams)
			want, _ := json.Marshal(tt.wantParams)
			if string(got) != string(want) {
				t.Errorf("targeted InstallParams = %s, want %s", got, want)
			}
			if *loaded.Version != "latest" {
				t.Errorf("loaded Version = %q, want the configured latest", *loaded.Version)
			}
			if after, _ := json.Marshal(loaded.InstallParams); string(after) != string(before) {
				t.Errorf("loaded InstallParams = %s, want the configured %s", after, before)
			}
		})
	}
}

// TestToolConfigUpdateRefusal pins which configurations update must leave alone: a
// tool whose installation asks for anything other than "latest" is pinned, whether
// .version() or an install parameter names it. The refusal names the pinned version
// and the setting that enables updates: v1's words for .version(), and the install
// parameter itself when that is what the installer honours.
func TestToolConfigUpdateRefusal(t *testing.T) {
	const byVersion = "Tool \"tool\" is pinned to version `%s`. Set version to \"latest\" in the tool config to enable updates"
	const byParam = "Tool \"tool\" is pinned to version `%s` by its %q install parameter. Set %[2]q to \"latest\" in the tool config to enable updates"
	tests := []struct {
		name       string
		method     string
		version    *string
		params     map[string]any
		wantReason string
	}{
		{name: "no version", version: nil},
		{name: "empty version", version: new("")},
		{name: "latest", version: new("latest")},
		{name: "exact version", version: new("v1.2.3"), wantReason: fmt.Sprintf(byVersion, "v1.2.3")},
		{name: "range", version: new("^1.2.0"), wantReason: fmt.Sprintf(byVersion, "^1.2.0")},
		{name: "a .version() pin on a method without a version parameter", method: "manual", version: new("v1.0.0"), wantReason: fmt.Sprintf(byVersion, "v1.0.0")},
		{
			name:       "github-release version install parameter",
			method:     "github-release",
			version:    new("latest"),
			params:     map[string]any{"repo": "acme/tool", "version": "v2.1.0"},
			wantReason: fmt.Sprintf(byParam, "v2.1.0", "version"),
		},
		{
			name:       "the install parameter the installer honours is the one named",
			method:     "gitea-release",
			version:    new("v1.0.0"),
			params:     map[string]any{"version": "v2.1.0"},
			wantReason: fmt.Sprintf(byParam, "v2.1.0", "version"),
		},
		{name: "an install parameter of latest overrides a .version() pin", method: "npm", version: new("1.0.0"), params: map[string]any{"version": "latest"}},
		{
			name:       "dmg github-release source version",
			method:     "dmg",
			params:     map[string]any{"source": map[string]any{"type": "github-release", "repo": "acme/app", "version": "v2.0.0"}},
			wantReason: fmt.Sprintf(byParam, "v2.0.0", "source.version"),
		},
		{name: "a version parameter the method never reads is no pin", method: "cargo", version: new("latest"), params: map[string]any{"version": "2.0.0"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tc := &ToolConfig{Name: "tool", InstallationMethod: tt.method, Version: tt.version, InstallParams: tt.params}
			reason, refused := tc.UpdateRefusal()
			if wantRefused := tt.wantReason != ""; refused != wantRefused || reason != tt.wantReason {
				t.Errorf("UpdateRefusal() = (%q, %v), want (%q, %v)", reason, refused, tt.wantReason, wantRefused)
			}
		})
	}
}

func TestProjectConfigInstantiationAndValidation(t *testing.T) {
	pc := ProjectConfig{
		Paths: PathsConfig{
			HomeDir:     "/home/user",
			DotfilesDir: "/home/user/dotfiles",
			TargetDir:   "/home/user/.bin",
		},
	}

	t.Run("Valid ProjectConfig", func(t *testing.T) {
		if err := pc.Validate(); err != nil {
			t.Errorf("expected no validation error, got %v", err)
		}
	})

	t.Run("Missing HomeDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.HomeDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "homeDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Missing DotfilesDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.DotfilesDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "dotfilesDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Missing TargetDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.TargetDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "targetDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestToolConfigValidation(t *testing.T) {
	tc := ToolConfig{
		Name: "bat",
	}

	t.Run("Valid Minimal ToolConfig", func(t *testing.T) {
		if err := tc.Validate(); err != nil {
			t.Errorf("expected no validation error, got %v", err)
		}
	})

	t.Run("Missing Name", func(t *testing.T) {
		invalid := tc
		invalid.Name = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "name is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid SymlinkConfig (Empty Source)", func(t *testing.T) {
		invalid := tc
		invalid.Symlinks = []SymlinkConfig{
			{Source: "", Target: "target"},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "source path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid SymlinkConfig (Empty Target)", func(t *testing.T) {
		invalid := tc
		invalid.Symlinks = []SymlinkConfig{
			{Source: "source", Target: ""},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "target path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid CopyConfig (Empty Source)", func(t *testing.T) {
		invalid := tc
		invalid.Copies = []CopyConfig{
			{Source: "", Target: "target"},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "source path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid CopyConfig (Empty Target)", func(t *testing.T) {
		invalid := tc
		invalid.Copies = []CopyConfig{
			{Source: "source", Target: ""},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "target path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid ShellScript (Invalid Kind)", func(t *testing.T) {
		invalid := tc
		invalid.ShellConfigs = &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Scripts: []ShellScript{
					{Kind: "invalid-kind", Value: "echo hello"},
				},
			},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "must be one of 'once', 'always', 'sourceFile', 'source' or 'sourceFunction'") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid ShellScript (Empty Value)", func(t *testing.T) {
		invalid := tc
		invalid.ShellConfigs = &ShellConfigs{
			Bash: &ShellTypeConfig{
				Scripts: []ShellScript{
					{Kind: "always", Value: ""},
				},
			},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "value cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid BinaryConfig (Empty Name)", func(t *testing.T) {
		bc := BinaryConfig{Name: "", Pattern: "pat"}
		if err := bc.Validate(); err == nil {
			t.Error("expected validation error, got nil")
		}
	})

	t.Run("Invalid BinaryConfig (Empty Pattern)", func(t *testing.T) {
		bc := BinaryConfig{Name: "bin", Pattern: ""}
		if err := bc.Validate(); err == nil {
			t.Error("expected validation error, got nil")
		}
	})
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func TestGetBinaryName(t *testing.T) {
	// A bare string is not a shape .bin() can record any more, so it names no binary.
	if got := getBinaryName("rg"); got != "" {
		t.Errorf("getBinaryName(\"rg\") = %q, want empty", got)
	}

	if got := getBinaryName(map[string]interface{}{"name": "bat"}); got != "bat" {
		t.Errorf("getBinaryName(map) = %q, want \"bat\"", got)
	}

	bc := BinaryConfig{Name: "fzf", Pattern: "fzf*"}
	if got := getBinaryName(bc); got != "fzf" {
		t.Errorf("getBinaryName(BinaryConfig) = %q, want \"fzf\"", got)
	}

	if got := getBinaryName(&bc); got != "fzf" {
		t.Errorf("getBinaryName(*BinaryConfig) = %q, want \"fzf\"", got)
	}

	var nilBc *BinaryConfig
	if got := getBinaryName(nilBc); got != "" {
		t.Errorf("getBinaryName(nil) = %q, want empty", got)
	}

	if got := getBinaryName(12345); got != "" {
		t.Errorf("getBinaryName(int) = %q, want empty", got)
	}
}

func TestToolConfigMerge(t *testing.T) {
	base := ToolConfig{
		Name:    "ripgrep",
		Version: strPtr("13.0.0"),
		Binaries: []interface{}{
			map[string]interface{}{"name": "rg"},
		},
		ShellConfigs: &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Aliases: map[string]string{"rgi": "rg -i"},
				Paths:   []interface{}{"/usr/local/bin"},
			},
		},
	}

	override := ToolConfig{
		Name:               "ripgrep-custom",
		Version:            strPtr("14.0.0"),
		ConfigFilePath:     "/etc/rg.conf",
		Disabled:           true,
		Hostname:           "my-host",
		Sudo:               true,
		InstallationMethod: "cargo",
		InstallParams:      map[string]interface{}{"crate": "ripgrep"},
		UpdateCheck:        &ToolConfigUpdateCheck{Enabled: boolPtr(true), Constraint: strPtr("latest")},
		Binaries: []interface{}{
			map[string]interface{}{"name": "rg"},  // duplicate binary name, should be skipped
			map[string]interface{}{"name": "rga"}, // new binary name, should be appended
			map[string]interface{}{"invalid": "no_name"},
		},
		Dependencies: []string{"pcre"},
		Symlinks: []SymlinkConfig{
			{Source: "a", Target: "b"},
			{Source: "a", Target: "b"}, // duplicate
		},
		Copies: []CopyConfig{
			{Source: "c", Target: "d"},
			{Source: "c", Target: "d"}, // duplicate
		},
		ShellConfigs: &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Aliases: map[string]string{"rga": "rga -i"},
				Paths:   []interface{}{"/opt/bin"},
				Scripts: []ShellScript{
					{Kind: "always", Value: "echo zsh"},
					{Kind: "sourceFile", Value: "source1.zsh"},
					{Kind: "source", Value: "source2.zsh"},
					{Kind: "sourceFunction", Value: "fn.zsh"},
				},
				Env:         map[string]string{"RG_COLOR": "always"},
				Completions: "complete/_rg",
			},
			Bash: &ShellTypeConfig{
				Functions: map[string]string{"f": "echo bash"},
			},
			Powershell: &ShellTypeConfig{
				Scripts: []ShellScript{{Kind: "source", Value: "profile.ps1"}},
			},
		},
	}

	rawOverride := map[string]interface{}{
		"name":               "ripgrep-custom",
		"version":            "14.0.0",
		"configFilePath":     "/etc/rg.conf",
		"disabled":           true,
		"hostname":           "my-host",
		"sudo":               true,
		"installationMethod": "cargo",
		"updateCheck":        map[string]interface{}{"enabled": true},
		"installParams":      map[string]interface{}{"crate": "ripgrep"},
		"binaries": []interface{}{
			map[string]interface{}{"name": "rg"},
			map[string]interface{}{"name": "rga"},
			map[string]interface{}{"invalid": "no_name"},
		},
	}

	base.Merge(&override, rawOverride)

	if base.Name != "ripgrep-custom" {
		t.Errorf("expected Name = ripgrep-custom, got %q", base.Name)
	}
	if base.Version == nil || *base.Version != "14.0.0" {
		t.Errorf("expected Version = 14.0.0, got %v", base.Version)
	}
	if base.ConfigFilePath != "/etc/rg.conf" || !base.Disabled || base.Hostname != "my-host" || !base.Sudo {
		t.Errorf("expected primitive fields merged")
	}
	if base.InstallationMethod != "cargo" {
		t.Errorf("expected InstallationMethod = cargo, got %q", base.InstallationMethod)
	}
	if len(base.Dependencies) != 1 || base.Dependencies[0] != "pcre" {
		t.Errorf("expected Dependencies merged")
	}
	if base.ShellConfigs.Zsh.Completions != "complete/_rg" {
		t.Errorf("expected Completions merged")
	}
	if got := base.ShellConfigs.Zsh.Scripts; len(got) != 4 {
		t.Errorf("expected the 4 zsh scripts (always, sourceFile, source, sourceFunction) merged in order, got %+v", got)
	}
	if got := base.ShellConfigs.Powershell.Scripts; len(got) != 1 || got[0].Kind != "source" {
		t.Errorf("expected the powershell source script merged, got %+v", got)
	}
}

func TestShellScriptValidateKinds(t *testing.T) {
	tests := []struct {
		name    string
		script  ShellScript
		wantErr bool
	}{
		{"once", ShellScript{Kind: "once", Value: "echo"}, false},
		{"always", ShellScript{Kind: "always", Value: "echo"}, false},
		{"sourceFile", ShellScript{Kind: "sourceFile", Value: "init.zsh"}, false},
		{"source", ShellScript{Kind: "source", Value: "echo inline"}, false},
		{"sourceFunction", ShellScript{Kind: "sourceFunction", Value: "fn"}, false},
		{"unknown kind", ShellScript{Kind: "raw", Value: "echo"}, true},
		{"empty kind", ShellScript{Kind: "", Value: "echo"}, true},
		{"empty value", ShellScript{Kind: "sourceFile", Value: ""}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.script.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate(%+v) error = %v, wantErr %v", tt.script, err, tt.wantErr)
			}
		})
	}
}

func TestValidateProjectAndShellConfigs(t *testing.T) {
	tcInvalid := &ShellTypeConfig{
		Scripts: []ShellScript{{Kind: "invalid", Value: "echo"}},
	}

	scZsh := ShellConfigs{Zsh: tcInvalid}
	if err := scZsh.Validate(); err == nil {
		t.Error("expected error for invalid Zsh config")
	}

	scBash := ShellConfigs{Bash: tcInvalid}
	if err := scBash.Validate(); err == nil {
		t.Error("expected error for invalid Bash config")
	}

	scPwsh := ShellConfigs{Powershell: tcInvalid}
	if err := scPwsh.Validate(); err == nil {
		t.Error("expected error for invalid Powershell config")
	}

	tc := ToolConfig{
		Name: "test",
		ShellConfigs: &ShellConfigs{
			Zsh: tcInvalid,
		},
	}
	if err := tc.Validate(); err == nil {
		t.Error("expected error for ToolConfig with invalid shell config")
	}
}

func TestFindTool(t *testing.T) {
	toolConfigs := []*ToolConfig{
		{
			Name: "github-release--bat",
			Binaries: []interface{}{
				map[string]interface{}{"name": "bat"},
				&BinaryConfig{Name: "batcat", Pattern: "batcat"},
			},
		},
		{
			Name: "cargo--eza",
			Binaries: []interface{}{
				map[string]interface{}{"name": "eza"},
			},
			ShellConfigs: &ShellConfigs{
				Zsh: &ShellTypeConfig{
					Aliases: map[string]string{"la": "eza -la"},
				},
				Bash: &ShellTypeConfig{
					Functions: map[string]string{"ezafn": "eza $1"},
				},
			},
		},
	}

	tests := []struct {
		name      string
		query     string
		wantMatch string
	}{
		{"exact tool name", "github-release--bat", "github-release--bat"},
		{"tool name suffix", "bat", "github-release--bat"},
		{"binary string match", "batcat", "github-release--bat"},
		{"binary map match", "eza", "cargo--eza"},
		{"zsh alias match", "la", "cargo--eza"},
		{"bash function match", "ezafn", "cargo--eza"},
		{"empty query", "", ""},
		{"whitespace query", "   ", ""},
		{"not found query", "nonexistent", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FindTool(toolConfigs, tt.query)
			if tt.wantMatch == "" {
				if got != nil {
					t.Errorf("FindTool(%q) = %v; want nil", tt.query, got)
				}
			} else {
				if got == nil {
					t.Fatalf("FindTool(%q) = nil; want %q", tt.query, tt.wantMatch)
				}
				if got.Name != tt.wantMatch {
					t.Errorf("FindTool(%q).Name = %q; want %q", tt.query, got.Name, tt.wantMatch)
				}
			}
		})
	}
}

func TestPathsConfig_GetToolConfigsDirs(t *testing.T) {
	tests := []struct {
		name  string
		paths PathsConfig
		want  []string
	}{
		{"unset", PathsConfig{}, nil},
		{"empty string", PathsConfig{ToolConfigsDir: ""}, nil},
		{"string", PathsConfig{ToolConfigsDir: "./custom-tools"}, []string{"./custom-tools"}},
		{"string slice", PathsConfig{ToolConfigsDir: []string{"./dir1", "./dir2"}}, []string{"./dir1", "./dir2"}},
		{"interface slice", PathsConfig{ToolConfigsDir: []interface{}{"./iface1", "./iface2"}}, []string{"./iface1", "./iface2"}},
		{"interface slice drops non-strings", PathsConfig{ToolConfigsDir: []interface{}{"./iface1", 42}}, []string{"./iface1"}},
		{"unsupported type", PathsConfig{ToolConfigsDir: 42}, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.paths.GetToolConfigsDirs()
			if !slices.Equal(got, tt.want) {
				t.Errorf("GetToolConfigsDirs() = %v, want %v", got, tt.want)
			}

			wantPrimary := ""
			if len(tt.want) > 0 {
				wantPrimary = tt.want[0]
			}
			if primary := tt.paths.GetPrimaryToolConfigsDir(); primary != wantPrimary {
				t.Errorf("GetPrimaryToolConfigsDir() = %q, want %q", primary, wantPrimary)
			}
		})
	}
}

func TestToolConfigValidateInstallParams(t *testing.T) {
	bin := func(name string) interface{} { return map[string]interface{}{"name": name} }
	// binPattern is the entry the loader records for .bin(name, pattern).
	binPattern := func(name, pattern string) interface{} {
		return map[string]interface{}{"name": name, "pattern": pattern}
	}
	// patternErr is what a rejected pattern must name: the tool, the binary, the
	// pattern, the method's binaryPath, and that binaryPath already names the file.
	// The remedy differs by method: manual never reads a pattern, so dropping
	// binaryPath is offered only to curl-script, which then searches {stagingDir}.
	patternErr := func(tool, binary, pattern, method, binaryPath string) []string {
		remedy := "; drop the pattern from .bin()"
		if method == "curl-script" {
			remedy += ", or drop binaryPath and point the script at {stagingDir}"
		}
		return []string{
			fmt.Sprintf("tool %q", tool),
			fmt.Sprintf("binary %q", binary),
			fmt.Sprintf("pattern %q", pattern),
			fmt.Sprintf("%s binaryPath %q", method, binaryPath),
			"already names the file",
			remedy,
		}
	}
	shimOff := false

	tests := []struct {
		name        string
		tool        ToolConfig
		wantErrs    []string
		notWantErrs []string
	}{
		{
			name:     "unknown installation method",
			tool:     ToolConfig{Name: "bogus", InstallationMethod: "github-releases"},
			wantErrs: []string{`tool "bogus"`, `unknown installation method "github-releases"`, strings.Join(InstallMethods(), ", ")},
		},
		{
			name: "no installation method",
			tool: ToolConfig{Name: "shell-only"},
		},
		{
			name: "curl-script binaryPath with one binary",
			tool: ToolConfig{
				Name:               "claude",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/claude"},
				Binaries:           []interface{}{bin("claude")},
			},
		},
		{
			name: "curl-script binaryPath with no .bin() names the tool itself",
			tool: ToolConfig{
				Name:               "claude",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/claude"},
			},
		},
		{
			name: "curl-script with several binaries and no binaryPath",
			tool: ToolConfig{
				Name:               "uv",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"env": map[string]interface{}{"UV_INSTALL_DIR": "{stagingDir}"}},
				Binaries:           []interface{}{bin("uv"), bin("uvx")},
			},
		},
		{
			name: "manual copies one binaryPath to several names",
			tool: ToolConfig{
				Name:               "alpha",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "alpha"},
				Binaries:           []interface{}{bin("alpha"), bin("alpha-extra")},
			},
		},
		{
			name: "curl-script binaryPath with two binaries",
			tool: ToolConfig{
				Name:               "uv",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/uv"},
				Binaries:           []interface{}{bin("uv"), bin("uvx")},
			},
			wantErrs: []string{`"uv"`, "binaryPath", `"~/.local/bin/uv"`, `"uvx"`, "{stagingDir}"},
		},
		{
			name: "manual binaryPath with a string pattern",
			tool: ToolConfig{
				Name:               "my-tool",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "./vendor/my-tool"},
				Binaries:           []interface{}{binPattern("my-tool", "no-such-dir/*/my-tool")},
			},
			wantErrs:    patternErr("my-tool", "my-tool", "no-such-dir/*/my-tool", "manual", "./vendor/my-tool"),
			notWantErrs: []string{"drop binaryPath"},
		},
		{
			name: "curl-script binaryPath with a string pattern",
			tool: ToolConfig{
				Name:               "curl-tool",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "./vendor/my-tool"},
				Binaries:           []interface{}{binPattern("curl-tool", "no-such-dir/*/curl-tool")},
			},
			wantErrs: patternErr("curl-tool", "curl-tool", "no-such-dir/*/curl-tool", "curl-script", "./vendor/my-tool"),
		},
		{
			name: "manual binaryPath with a pattern in the options form",
			tool: ToolConfig{
				Name:               "my-tool",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "./vendor/my-tool"},
				Binaries: []interface{}{
					map[string]interface{}{"name": "my-tool", "pattern": "*/bin/my-tool", "shim": false},
				},
			},
			wantErrs:    patternErr("my-tool", "my-tool", "*/bin/my-tool", "manual", "./vendor/my-tool"),
			notWantErrs: []string{"drop binaryPath"},
		},
		{
			name: "curl-script binaryPath with a pattern in the options form",
			tool: ToolConfig{
				Name:               "claude",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/claude"},
				Binaries: []interface{}{
					map[string]interface{}{"name": "claude", "pattern": "/^claude$/i", "shim": true},
				},
			},
			wantErrs: patternErr("claude", "claude", "/^claude$/i", "curl-script", "~/.local/bin/claude"),
		},
		{
			name: "manual binaryPath with a pattern on a BinaryConfig value",
			tool: ToolConfig{
				Name:               "alpha",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "alpha"},
				Binaries:           []interface{}{bin("alpha"), BinaryConfig{Name: "alpha-extra", Pattern: "bin/alpha"}},
			},
			wantErrs:    patternErr("alpha", "alpha-extra", "bin/alpha", "manual", "alpha"),
			notWantErrs: []string{"drop binaryPath"},
		},
		{
			name: "curl-script binaryPath with a pattern on a BinaryConfig pointer",
			tool: ToolConfig{
				Name:               "claude",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/claude"},
				Binaries:           []interface{}{&BinaryConfig{Name: "claude", Pattern: "bin/claude"}},
			},
			wantErrs: patternErr("claude", "claude", "bin/claude", "curl-script", "~/.local/bin/claude"),
		},
		{
			name: "manual binaryPath with shim false and no pattern",
			tool: ToolConfig{
				Name:               "my-tool",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "./vendor/my-tool"},
				Binaries: []interface{}{
					map[string]interface{}{"name": "my-tool", "shim": false},
					// An empty or non-string pattern selects nothing: the installer
					// reads either as "no pattern", as it does a BinaryConfig's "".
					map[string]interface{}{"name": "my-tool-empty", "pattern": ""},
					map[string]interface{}{"name": "my-tool-null", "pattern": nil},
					BinaryConfig{Name: "my-tool-extra", Shim: &shimOff},
					(*BinaryConfig)(nil),
				},
			},
		},
		{
			name: "curl-script binaryPath with shim false and no pattern",
			tool: ToolConfig{
				Name:               "claude",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"binaryPath": "~/.local/bin/claude"},
				Binaries:           []interface{}{map[string]interface{}{"name": "claude", "shim": false}},
			},
		},
		{
			name: "manual pattern without binaryPath",
			tool: ToolConfig{
				Name:               "my-tool",
				InstallationMethod: "manual",
				Binaries:           []interface{}{binPattern("my-tool", "*/bin/my-tool")},
			},
		},
		{
			name: "curl-script pattern without binaryPath",
			tool: ToolConfig{
				Name:               "uv",
				InstallationMethod: "curl-script",
				InstallParams:      map[string]interface{}{"env": map[string]interface{}{"UV_INSTALL_DIR": "{stagingDir}"}},
				Binaries:           []interface{}{binPattern("uv", "*/bin/uv"), binPattern("uvx", "*/bin/uvx")},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.tool.Validate()
			if len(tt.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatal("Validate() = nil, want an error")
			}
			for _, want := range tt.wantErrs {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("Validate() = %v, want it to contain %s", err, want)
				}
			}
			for _, notWant := range tt.notWantErrs {
				if strings.Contains(err.Error(), notWant) {
					t.Errorf("Validate() = %v, want it not to contain %s", err, notWant)
				}
			}
		})
	}
}
