package config

import (
	"fmt"
	"maps"
	"slices"
	"strings"
)

// installMethods names every installation method an installer handles, sorted. The
// installers are compiled in and register themselves with installer.DefaultRegistry,
// which the loader cannot consult (pkg/installer imports pkg/vm, and the load runs
// before the registry is built), so the set is written out here. Tests pin it to that
// registry and to the InstallMethod union in pkg/vm/dsl-types.ts.
var installMethods = []string{
	"apt",
	"brew",
	"cargo",
	"curl-binary",
	"curl-script",
	"curl-tar",
	"dmg",
	"dnf",
	"gitea-release",
	"github-release",
	"manual",
	"npm",
	"pacman",
	"pkg",
	"zsh-plugin",
}

// InstallMethods returns the name of every installation method an installer handles,
// sorted. It is a copy, so a caller cannot change what the load accepts.
func InstallMethods() []string {
	return slices.Clone(installMethods)
}

// validateInstallParams rejects install parameters that cannot be installed as
// written, whatever the target: a combination that only fails once the installation
// has already run a script is reported while the configuration loads instead. It is
// one part of ToolConfig.Validate, and a rule for another method's parameters is a
// new case of this switch.
func (tc *ToolConfig) validateInstallParams() error {
	if err := tc.validateInstallationMethod(); err != nil {
		return err
	}
	switch tc.InstallationMethod {
	case "curl-script":
		if err := tc.validateCurlScriptBinaryPath(); err != nil {
			return err
		}
		return tc.validateBinaryPathPatterns()
	case "manual":
		return tc.validateBinaryPathPatterns()
	case "cargo":
		_, err := tc.CargoSources()
		return err
	}
	return nil
}

// validateInstallationMethod rejects a method no installer handles: nothing could ever
// install the tool, and its shim would fail on every run. A tool without a method
// (install() called without arguments) is configuration only and passes.
func (tc *ToolConfig) validateInstallationMethod() error {
	if tc.InstallationMethod == "" || slices.Contains(installMethods, tc.InstallationMethod) {
		return nil
	}
	return fmt.Errorf("tool %q: unknown installation method %q; valid methods: %s",
		tc.Name, tc.InstallationMethod, strings.Join(installMethods, ", "))
}

// binaryPath returns the binaryPath install parameter, or "" when none is set.
func (tc *ToolConfig) binaryPath() string {
	binaryPath, _ := tc.InstallParams["binaryPath"].(string)
	return binaryPath
}

// validateBinaryPathPatterns rejects a .bin() pattern on a tool whose binaryPath names
// the file to install. manual and curl-script install that one file under every
// declared name and never search a tree, so neither installer reads the pattern, and
// the tool could install a different file than the pattern describes. The shim
// generator does read a literal pattern such as "bin/tool" and would point the shim
// at that path under the tool's current directory instead of the file binaryPath
// installs, so the shim and the installed binary could disagree.
func (tc *ToolConfig) validateBinaryPathPatterns() error {
	binaryPath := tc.binaryPath()
	if binaryPath == "" {
		return nil
	}
	for _, b := range tc.Binaries {
		pattern, declared := declaredBinaryPattern(b)
		if !declared {
			continue
		}
		return fmt.Errorf(
			"tool %q: binary %q declares pattern %q, but %s binaryPath %q already names the file to install, "+
				"so the pattern would never be used; %s",
			tc.Name, getBinaryName(b), pattern, tc.InstallationMethod, binaryPath, tc.binaryPatternRemedy())
	}
	return nil
}

// binaryPatternRemedy says how to fix a pattern declared alongside binaryPath. Only
// curl-script searches a tree for a pattern, and only when it stages into
// {stagingDir}; manual never reads a pattern, so dropping the pattern is its only fix.
func (tc *ToolConfig) binaryPatternRemedy() string {
	if tc.InstallationMethod == "curl-script" {
		return "drop the pattern from .bin(), or drop binaryPath and point the script at {stagingDir} through args or env"
	}
	return "drop the pattern from .bin()"
}

// declaredBinaryPattern returns the pattern a binary entry declares and whether it
// declares one, reading every entry shape the way installer.getPatternForBinary does:
// only a non-empty string selects a file, and anything else leaves the default glob.
// The loader records a pattern only when .bin() was given one (a RegExp arrives as its
// /source/flags text), so the default glob never counts as declared.
func declaredBinaryPattern(b interface{}) (string, bool) {
	switch val := b.(type) {
	case map[string]interface{}:
		pattern, _ := val["pattern"].(string)
		return pattern, pattern != ""
	case BinaryConfig:
		return val.Pattern, val.Pattern != ""
	case *BinaryConfig:
		if val != nil {
			return val.Pattern, val.Pattern != ""
		}
	}
	return "", false
}

// validateCurlScriptBinaryPath enforces that a curl-script binaryPath stands for one
// binary. It is a single path, so with several binaries it cannot say which one it is,
// and a script that installs several can be pointed at the staging directory instead.
func (tc *ToolConfig) validateCurlScriptBinaryPath() error {
	binaryPath := tc.binaryPath()
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
