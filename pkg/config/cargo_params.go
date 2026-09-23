package config

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// The values the cargo installer's binarySource and versionSource parameters take.
const (
	CargoBinarySourceQuickinstall   = "cargo-quickinstall"
	CargoBinarySourceGitHubReleases = "github-releases"

	CargoVersionSourceCargoToml      = "cargo-toml"
	CargoVersionSourceCratesIO       = "crates-io"
	CargoVersionSourceGitHubReleases = "github-releases"
)

// cargoBinarySources and cargoVersionSources are every value the cargo installer
// accepts for binarySource and versionSource, sorted. Tests pin them to the values the
// installer dispatches on and to ICargoInstallParams in pkg/vm/dsl-types.ts.
var (
	cargoBinarySources  = []string{CargoBinarySourceQuickinstall, CargoBinarySourceGitHubReleases}
	cargoVersionSources = []string{CargoVersionSourceCargoToml, CargoVersionSourceCratesIO, CargoVersionSourceGitHubReleases}
)

// CargoBinarySources returns every value the cargo binarySource parameter accepts,
// sorted. It is a copy, so a caller cannot change what the load accepts.
func CargoBinarySources() []string {
	return slices.Clone(cargoBinarySources)
}

// CargoVersionSources returns every value the cargo versionSource parameter accepts,
// sorted. It is a copy, so a caller cannot change what the load accepts.
func CargoVersionSources() []string {
	return slices.Clone(cargoVersionSources)
}

// CargoSources is where a cargo installation takes its prebuilt binary and its version
// from, with the parameters those sources read. ToolConfig.CargoSources is the only
// reading of them, so an install, an update check and the load cannot disagree.
type CargoSources struct {
	// Binary is the binarySource: CargoBinarySourceQuickinstall unless the tool says.
	Binary string
	// Version is the versionSource, or the default the binary source and
	// cargoTomlUrl select when the tool names none.
	Version string
	// GitHubRepo is the githubRepo parameter, or "" when the sources need none.
	GitHubRepo string
	// CargoTomlURL is the cargoTomlUrl parameter, or "" when none is set.
	CargoTomlURL string
}

// CargoSources reads the cargo tool's binarySource and versionSource, applying their
// defaults, and rejects a combination that can never install as written: a value
// outside the accepted ones, or a source without the parameter it reads (the
// github-releases sources read githubRepo, and cargo-toml reads cargoTomlUrl or the
// Cargo.toml of githubRepo). Every error is a configuration error naming the tool.
func (tc *ToolConfig) CargoSources() (CargoSources, error) {
	binary, err := tc.cargoSourceParam("binarySource", CargoBinarySourceQuickinstall, cargoBinarySources)
	if err != nil {
		return CargoSources{}, err
	}
	sources := CargoSources{Binary: binary}
	if sources.GitHubRepo, err = tc.cargoStringParam("githubRepo"); err != nil {
		return CargoSources{}, err
	}
	if sources.CargoTomlURL, err = tc.cargoStringParam("cargoTomlUrl"); err != nil {
		return CargoSources{}, err
	}
	sources.Version, err = tc.cargoSourceParam("versionSource", defaultCargoVersionSource(binary, sources.CargoTomlURL), cargoVersionSources)
	if err != nil {
		return CargoSources{}, err
	}

	if sources.Binary == CargoBinarySourceGitHubReleases && sources.GitHubRepo == "" {
		return CargoSources{}, fmt.Errorf("tool %q: cargo binarySource %q requires githubRepo", tc.Name, sources.Binary)
	}
	switch sources.Version {
	case CargoVersionSourceGitHubReleases:
		if sources.GitHubRepo == "" {
			return CargoSources{}, fmt.Errorf("tool %q: cargo versionSource %q requires githubRepo", tc.Name, sources.Version)
		}
	case CargoVersionSourceCargoToml:
		if sources.GitHubRepo == "" && sources.CargoTomlURL == "" {
			return CargoSources{}, fmt.Errorf("tool %q: cargo versionSource %q requires githubRepo or cargoTomlUrl", tc.Name, sources.Version)
		}
	}
	return sources, nil
}

// defaultCargoVersionSource picks where a version comes from when the tool does not
// say. A Cargo.toml URL is only ever given to be read, a GitHub release download can
// only succeed with a tag the repository really has, and quickinstall builds what
// crates.io publishes.
func defaultCargoVersionSource(binarySource, cargoTomlURL string) string {
	switch {
	case cargoTomlURL != "":
		return CargoVersionSourceCargoToml
	case binarySource == CargoBinarySourceGitHubReleases:
		return CargoVersionSourceGitHubReleases
	default:
		return CargoVersionSourceCratesIO
	}
}

// cargoSourceParam reads the install parameter key, which must be one of valid, or
// returns defaultValue when the tool does not set it. A value that is present but not
// one of valid (an empty string or null included) is an error: v1 rejected it with its
// schema, and taking the default instead would install from a source nobody chose.
func (tc *ToolConfig) cargoSourceParam(key, defaultValue string, valid []string) (string, error) {
	raw, set := tc.InstallParams[key]
	if !set {
		return defaultValue, nil
	}
	value, isString := raw.(string)
	if !isString {
		return "", fmt.Errorf("tool %q: cargo %s must be a string; valid values: %s; got %s",
			tc.Name, key, strings.Join(valid, ", "), writtenValue(raw))
	}
	if !slices.Contains(valid, value) {
		return "", fmt.Errorf("tool %q: unknown cargo %s %q; valid values: %s",
			tc.Name, key, value, strings.Join(valid, ", "))
	}
	return value, nil
}

// cargoStringParam reads the string install parameter key, or "" when the tool does
// not set it. A value that is present but not a string (null included) is an error, as
// v1's schema made it: reading it as unset would choose a source the tool never named,
// or blame a parameter the tool did write.
func (tc *ToolConfig) cargoStringParam(key string) (string, error) {
	raw, set := tc.InstallParams[key]
	if !set {
		return "", nil
	}
	value, isString := raw.(string)
	if !isString {
		return "", fmt.Errorf("tool %q: cargo %s must be a string; got %s", tc.Name, key, writtenValue(raw))
	}
	return value, nil
}

// writtenValue renders a decoded install parameter the way a tool file writes it
// (1, true, null), falling back to Go's formatting for a value JSON cannot encode.
func writtenValue(raw interface{}) string {
	written, err := json.Marshal(raw)
	if err != nil {
		return fmt.Sprintf("%v", raw)
	}
	return string(written)
}
