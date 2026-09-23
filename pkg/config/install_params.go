package config

import (
	"fmt"
	"maps"
	"strings"
)

// ValidateInstallParams rejects install parameters that cannot be installed as
// written, whatever the target: a combination that only fails once the installation
// has already run a script is reported while the configuration loads instead.
func (tc *ToolConfig) ValidateInstallParams() error {
	if tc.InstallationMethod == "curl-script" {
		return tc.validateCurlScriptBinaryPath()
	}
	return nil
}

// validateCurlScriptBinaryPath enforces that a curl-script binaryPath stands for one
// binary. It is a single path, so with several binaries it cannot say which one it is,
// and a script that installs several can be pointed at the staging directory instead.
func (tc *ToolConfig) validateCurlScriptBinaryPath() error {
	binaryPath, _ := tc.InstallParams["binaryPath"].(string)
	if binaryPath == "" || len(tc.Binaries) <= 1 {
		return nil
	}

	names := make([]string, 0, len(tc.Binaries))
	for _, b := range tc.Binaries {
		names = append(names, fmt.Sprintf("%q", getBinaryName(b)))
	}
	return fmt.Errorf(
		"tool %q: curl-script binaryPath %q is a single path, but the tool declares %d binaries (%s); "+
			"declare one .bin(), or drop binaryPath and point the script at {stagingDir} through args or env",
		tc.Name, binaryPath, len(tc.Binaries), strings.Join(names, ", "))
}

// RequestedVersion returns the version an installation of tc asks for, or "" when its
// configuration names none, in which case the installer takes the latest release. It
// is the one reading of that choice: the installers install what it names, and
// UpdateRefusal treats anything it names other than "latest" as a pin.
func (tc *ToolConfig) RequestedVersion() string {
	version, _ := tc.requestedVersion()
	return version
}

// requestedVersion returns the version an installation of tc asks for and the install
// parameter that names it, which is "" when the version comes from .version(). The
// methods whose installers take a version install parameter let it win over
// .version(): github-release, gitea-release, apt, dnf, pacman and npm read `version`,
// and dmg and pkg read the `version` of a github-release `source` (a direct-URL source
// has no version to name). For every other method the requested version is
// .version(), so a `version` parameter written for one of them names nothing.
func (tc *ToolConfig) requestedVersion() (version, param string) {
	switch tc.InstallationMethod {
	case "github-release", "gitea-release", "apt", "dnf", "pacman", "npm":
		if v, _ := tc.InstallParams["version"].(string); v != "" {
			return v, "version"
		}
	case "dmg", "pkg":
		source, _ := tc.InstallParams["source"].(map[string]any)
		if sourceType, _ := source["type"].(string); sourceType == "github-release" {
			if v, _ := source["version"].(string); v != "" {
				return v, "source.version"
			}
		}
	}
	if tc.Version != nil {
		return *tc.Version, ""
	}
	return "", ""
}

// WithRequestedVersion returns a copy of tc whose installation asks for version, written
// where requestedVersion reads it: .version(), and the install parameter that wins over
// it when one is set, so that a `version: "latest"` parameter cannot send the
// installation back to the latest release. tc itself keeps what the user wrote, so a
// later update of the same tool is not refused as pinned to the version this one
// installs. No install parameter is added that the configuration does not already
// carry, since .version() names the version wherever none is set.
func (tc *ToolConfig) WithRequestedVersion(version string) *ToolConfig {
	targeted := *tc
	targeted.Version = &version
	_, param := tc.requestedVersion()
	switch param {
	case "version":
		targeted.InstallParams = maps.Clone(tc.InstallParams)
		targeted.InstallParams["version"] = version
	case "source.version":
		source := maps.Clone(tc.InstallParams["source"].(map[string]any))
		source["version"] = version
		targeted.InstallParams = maps.Clone(tc.InstallParams)
		targeted.InstallParams["source"] = source
	}
	return &targeted
}
