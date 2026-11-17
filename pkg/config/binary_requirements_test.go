package config

import (
	"strings"
	"testing"
)

// TestValidateInstallParamsBinaryRequirements pins the methods that cannot work without
// a declared binary. A tool's binaries come only from .bin(), so a parameter that names
// a binary file, or a download that is one, needs a .bin() to install it under; every
// other tool may declare none.
func TestValidateInstallParamsBinaryRequirements(t *testing.T) {
	bins := func(names ...string) []interface{} {
		out := make([]interface{}, 0, len(names))
		for _, name := range names {
			out = append(out, map[string]interface{}{"name": name})
		}
		return out
	}
	tests := []struct {
		name     string
		method   string
		params   map[string]interface{}
		binaries []interface{}
		wantErrs []string
	}{
		{name: "curl-binary with one binary", method: "curl-binary", params: map[string]interface{}{"url": "https://example.com/t"}, binaries: bins("t")},
		{
			name:     "curl-binary without a binary",
			method:   "curl-binary",
			params:   map[string]interface{}{"url": "https://example.com/t"},
			wantErrs: []string{`tool "probe"`, "curl-binary", "declares none", "declare one .bin()"},
		},
		{
			name:     "curl-binary with two binaries",
			method:   "curl-binary",
			params:   map[string]interface{}{"url": "https://example.com/t"},
			binaries: bins("a", "b"),
			wantErrs: []string{`tool "probe"`, "curl-binary", `declares 2 binaries ("a", "b")`},
		},
		{
			name:     "curl-script binaryPath without a binary",
			method:   "curl-script",
			params:   map[string]interface{}{"url": "https://example.com/install.sh", "binaryPath": "~/.local/bin/t"},
			wantErrs: []string{`tool "probe"`, `curl-script binaryPath "~/.local/bin/t"`, "declares no .bin()"},
		},
		{name: "curl-script without binaryPath or binary", method: "curl-script", params: map[string]interface{}{"url": "https://example.com/install.sh"}},
		{
			name:     "manual binaryPath without a binary",
			method:   "manual",
			params:   map[string]interface{}{"binaryPath": "./bin/t"},
			wantErrs: []string{`tool "probe"`, `manual binaryPath "./bin/t"`, "declares no .bin()"},
		},
		{name: "manual binaryPath with a binary", method: "manual", params: map[string]interface{}{"binaryPath": "./bin/t"}, binaries: bins("t")},
		{name: "manual without binaryPath or binary", method: "manual"},
		{
			name:     "pkg binaryPath without a binary",
			method:   "pkg",
			params:   map[string]interface{}{"binaryPath": "/usr/local/bin/t"},
			wantErrs: []string{`tool "probe"`, `pkg binaryPath "/usr/local/bin/t"`, "declares no .bin()"},
		},
		{name: "pkg without binaryPath or binary", method: "pkg"},
		{name: "dmg application without a binary", method: "dmg", params: map[string]interface{}{"binaryName": "App"}},
		{name: "github-release without a binary", method: "github-release", params: map[string]interface{}{"repo": "owner/repo"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := &ToolConfig{Name: "probe", InstallationMethod: tt.method, InstallParams: tt.params, Binaries: tt.binaries}
			err := tool.ValidateInstallParams()
			if len(tt.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("ValidateInstallParams() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("ValidateInstallParams() = nil, want an error containing %q", tt.wantErrs)
			}
			for _, want := range tt.wantErrs {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("ValidateInstallParams() = %q, want it to contain %q", err, want)
				}
			}
		})
	}
}

// TestInactiveBranchesCountToolLevelBinaries covers a tool that declares its binary once
// and picks a download per platform: every branch that does not match this machine
// installs that binary too, so its binary requirements are met, also when the branch
// repeats the declaration.
func TestInactiveBranchesCountToolLevelBinaries(t *testing.T) {
	branch := func(binaries ...interface{}) InactivePlatformConfig {
		return InactivePlatformConfig{
			Platforms:          PlatformLinux,
			InstallationMethod: "curl-binary",
			InstallParams:      map[string]interface{}{"url": "https://example.com/amp-linux-x64"},
			Binaries:           binaries,
		}
	}
	amp := map[string]interface{}{"name": "amp"}
	tests := []struct {
		name     string
		tool     []interface{}
		branch   InactivePlatformConfig
		wantErrs []string
	}{
		{name: "binary declared on the tool", tool: []interface{}{amp}, branch: branch()},
		{name: "binary declared on the tool and in the branch", tool: []interface{}{amp}, branch: branch(amp)},
		{name: "binary declared only in the branch", branch: branch(amp)},
		{name: "no binary anywhere", branch: branch(), wantErrs: []string{`tool "amp-cli" (platform Linux)`, "curl-binary", "declares none"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := &ToolConfig{Name: "amp-cli", Binaries: tt.tool, InactivePlatformConfigs: []InactivePlatformConfig{tt.branch}}
			err := tool.Validate()
			if len(tt.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Validate() = nil, want an error containing %q", tt.wantErrs)
			}
			for _, want := range tt.wantErrs {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("Validate() = %q, want it to contain %q", err, want)
				}
			}
		})
	}
}
