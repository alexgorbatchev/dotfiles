package config

import (
	"strings"
	"testing"
)

// TestToolConfigValidateCargoParams pins which cargo source settings load (#127). A
// binarySource or versionSource outside the declared values, and a source whose
// companion parameter is missing, can never install as written, so the load rejects
// them, naming the tool, the value and what would make it valid.
func TestToolConfigValidateCargoParams(t *testing.T) {
	const binaryValues = "valid values: cargo-quickinstall, github-releases"
	const versionValues = "valid values: cargo-toml, crates-io, github-releases"
	tests := []struct {
		name     string
		params   map[string]interface{}
		wantErrs []string
	}{
		{name: "no parameters"},
		{name: "cargo-quickinstall", params: map[string]interface{}{"binarySource": "cargo-quickinstall"}},
		{
			name:   "github-releases binaries with githubRepo",
			params: map[string]interface{}{"binarySource": "github-releases", "githubRepo": "sharkdp/bat"},
		},
		{name: "crates-io", params: map[string]interface{}{"versionSource": "crates-io"}},
		{name: "cargo-toml from githubRepo", params: map[string]interface{}{"versionSource": "cargo-toml", "githubRepo": "sharkdp/bat"}},
		{
			name:   "cargo-toml from cargoTomlUrl",
			params: map[string]interface{}{"versionSource": "cargo-toml", "cargoTomlUrl": "https://example.com/Cargo.toml"},
		},
		{
			name:   "cargoTomlUrl selects cargo-toml by default",
			params: map[string]interface{}{"cargoTomlUrl": "https://example.com/Cargo.toml"},
		},
		{
			name:   "github-releases versions with githubRepo",
			params: map[string]interface{}{"versionSource": "github-releases", "githubRepo": "sharkdp/bat"},
		},
		{
			name:     "misspelt binarySource",
			params:   map[string]interface{}{"binarySource": "quickinstall"},
			wantErrs: []string{`unknown cargo binarySource "quickinstall"`, binaryValues},
		},
		{
			name:     "singular github-release binarySource",
			params:   map[string]interface{}{"binarySource": "github-release", "githubRepo": "sharkdp/bat"},
			wantErrs: []string{`unknown cargo binarySource "github-release"`, binaryValues},
		},
		{
			name:     "a version source as binarySource",
			params:   map[string]interface{}{"binarySource": "crates-io"},
			wantErrs: []string{`unknown cargo binarySource "crates-io"`, binaryValues},
		},
		{
			name:     "empty binarySource",
			params:   map[string]interface{}{"binarySource": ""},
			wantErrs: []string{`unknown cargo binarySource ""`, binaryValues},
		},
		{
			name:     "binarySource that is not a string",
			params:   map[string]interface{}{"binarySource": float64(1)},
			wantErrs: []string{"cargo binarySource must be a string", binaryValues, "got 1"},
		},
		{
			name:     "null binarySource",
			params:   map[string]interface{}{"binarySource": nil},
			wantErrs: []string{"cargo binarySource must be a string", binaryValues, "got null"},
		},
		{
			name:     "unknown versionSource",
			params:   map[string]interface{}{"versionSource": "npm"},
			wantErrs: []string{`unknown cargo versionSource "npm"`, versionValues},
		},
		{
			name:     "empty versionSource",
			params:   map[string]interface{}{"versionSource": ""},
			wantErrs: []string{`unknown cargo versionSource ""`, versionValues},
		},
		{
			name:     "versionSource that is not a string",
			params:   map[string]interface{}{"versionSource": true},
			wantErrs: []string{"cargo versionSource must be a string", versionValues, "got true"},
		},
		{
			name:     "githubRepo that is not a string",
			params:   map[string]interface{}{"binarySource": "github-releases", "githubRepo": float64(123)},
			wantErrs: []string{"cargo githubRepo must be a string; got 123"},
		},
		{
			name:     "null githubRepo",
			params:   map[string]interface{}{"githubRepo": nil},
			wantErrs: []string{"cargo githubRepo must be a string; got null"},
		},
		{
			// Read as unset, it would resolve the version from crates.io, a source the
			// tool never named.
			name:     "cargoTomlUrl that is not a string",
			params:   map[string]interface{}{"cargoTomlUrl": float64(42)},
			wantErrs: []string{"cargo cargoTomlUrl must be a string; got 42"},
		},
		{
			name:     "github-releases binaries without githubRepo",
			params:   map[string]interface{}{"binarySource": "github-releases"},
			wantErrs: []string{`cargo binarySource "github-releases" requires githubRepo`},
		},
		{
			name:     "github-releases binaries with an empty githubRepo",
			params:   map[string]interface{}{"binarySource": "github-releases", "githubRepo": ""},
			wantErrs: []string{`cargo binarySource "github-releases" requires githubRepo`},
		},
		{
			name:     "cargo-toml without githubRepo or cargoTomlUrl",
			params:   map[string]interface{}{"versionSource": "cargo-toml"},
			wantErrs: []string{`cargo versionSource "cargo-toml" requires githubRepo or cargoTomlUrl`},
		},
		{
			name:     "github-releases versions without githubRepo",
			params:   map[string]interface{}{"versionSource": "github-releases"},
			wantErrs: []string{`cargo versionSource "github-releases" requires githubRepo`},
		},
		{
			// A pin decides what an install downloads, but an update check still asks
			// the versionSource, so the pin does not excuse a source that cannot answer.
			name:     "github-releases versions without githubRepo, with cargoTomlUrl",
			params:   map[string]interface{}{"versionSource": "github-releases", "cargoTomlUrl": "https://example.com/Cargo.toml"},
			wantErrs: []string{`cargo versionSource "github-releases" requires githubRepo`},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := ToolConfig{Name: "bat", InstallationMethod: "cargo", InstallParams: tt.params}
			err := tool.Validate()
			if len(tt.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatal("Validate() = nil, want an error")
			}
			for _, want := range append([]string{`tool "bat"`}, tt.wantErrs...) {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("Validate() = %v, want it to contain %q", err, want)
				}
			}
		})
	}
}

// TestToolConfigCargoSources pins the defaults the cargo installer applies: the binary
// source is cargo-quickinstall, and the version source follows what the binary source
// can download, unless a cargoTomlUrl says where the version is read from.
func TestToolConfigCargoSources(t *testing.T) {
	const tomlURL = "https://example.com/Cargo.toml"
	tests := []struct {
		name   string
		params map[string]interface{}
		want   CargoSources
	}{
		{
			name: "defaults",
			want: CargoSources{Binary: CargoBinarySourceQuickinstall, Version: CargoVersionSourceCratesIO},
		},
		{
			name:   "github-releases binaries read the version from the release tag",
			params: map[string]interface{}{"binarySource": "github-releases", "githubRepo": "sharkdp/bat"},
			want:   CargoSources{Binary: CargoBinarySourceGitHubReleases, Version: CargoVersionSourceGitHubReleases, GitHubRepo: "sharkdp/bat"},
		},
		{
			name:   "cargoTomlUrl reads the version from the Cargo.toml",
			params: map[string]interface{}{"binarySource": "github-releases", "githubRepo": "sharkdp/bat", "cargoTomlUrl": tomlURL},
			want: CargoSources{
				Binary: CargoBinarySourceGitHubReleases, Version: CargoVersionSourceCargoToml,
				GitHubRepo: "sharkdp/bat", CargoTomlURL: tomlURL,
			},
		},
		{
			name:   "an explicit versionSource wins over the default",
			params: map[string]interface{}{"versionSource": "crates-io", "cargoTomlUrl": tomlURL},
			want:   CargoSources{Binary: CargoBinarySourceQuickinstall, Version: CargoVersionSourceCratesIO, CargoTomlURL: tomlURL},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := ToolConfig{Name: "bat", InstallationMethod: "cargo", InstallParams: tt.params}
			got, err := tool.CargoSources()
			if err != nil {
				t.Fatalf("CargoSources() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("CargoSources() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// The accessors hand out copies, so no caller can change what the load accepts.
func TestCargoSourceListsAreCopies(t *testing.T) {
	CargoBinarySources()[0] = "changed"
	CargoVersionSources()[0] = "changed"
	if CargoBinarySources()[0] != CargoBinarySourceQuickinstall || CargoVersionSources()[0] != CargoVersionSourceCargoToml {
		t.Fatalf("CargoBinarySources() = %v, CargoVersionSources() = %v; a caller changed the canonical lists",
			CargoBinarySources(), CargoVersionSources())
	}
}

// The cargo source parameters mean something only to the cargo installer: another
// method that happens to carry the same keys is not checked against cargo's values.
func TestToolConfigValidateCargoParamsOnlyForCargo(t *testing.T) {
	tool := ToolConfig{
		Name:               "bat",
		InstallationMethod: "github-release",
		InstallParams:      map[string]interface{}{"repo": "sharkdp/bat", "binarySource": "quickinstall", "versionSource": "npm"},
	}
	if err := tool.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}
}
