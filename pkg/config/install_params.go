package config

import (
	"fmt"
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
