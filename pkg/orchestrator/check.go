package orchestrator

import (
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
)

// AheadOfLatestMessage is what a check or an update reports for a tool installed at a
// version newer than the latest one upstream resolved, in v1's words. subject names the
// installation: its version where the tool is already named (a tagged log line), or
// "<tool> (<version>)" where it is not.
func AheadOfLatestMessage(subject, latestVersion string) string {
	return fmt.Sprintf("%s is ahead of the latest known version (%s)", subject, latestVersion)
}

// CheckStatus is what an update check found for one tool. Its values are the `status`
// that tool check --json and the dashboard's check-update route report, so they are
// spelled as the rest of that output spells states: lowercase and hyphenated.
type CheckStatus string

const (
	// CheckStatusUpToDate: the installed version is the latest one, or no newer one
	// counts as an update (the package manager says so, or updateCheck.constraint
	// excludes it).
	CheckStatusUpToDate CheckStatus = "up-to-date"
	// CheckStatusUpdateAvailable: a newer version counts as an update.
	CheckStatusUpdateAvailable CheckStatus = "update-available"
	// CheckStatusAheadOfLatest: the installed version is newer than the latest one
	// upstream, such as a prerelease or a release upstream has since withdrawn. It is
	// neither current nor outdated, and an update never replaces it with the older one.
	CheckStatusAheadOfLatest CheckStatus = "ahead-of-latest"
	// CheckStatusUnsupported: the installer has no way to learn the latest version
	// upstream (installer.ErrUpdateCheckUnsupported), so nothing was compared.
	CheckStatusUnsupported CheckStatus = "unsupported"
)

// CheckResult is what an update check found for one tool.
type CheckResult struct {
	Status CheckStatus
	// InstalledVersion is the version the installation record holds, the one the
	// status is measured against.
	InstalledVersion string
	// LatestVersion is the newest version the installer resolved upstream; empty when
	// nothing was asked or the installer resolved none.
	LatestVersion string
	// Cached is set when the latest version came from a cached upstream answer.
	Cached bool
}

// ClassifyCheck turns what tool's installer answered for an installation at
// installedVersion into the status a check reports. installer.ErrUpdateCheckUnsupported
// is CheckStatusUnsupported; any other checkErr is returned, wrapped, since a check that
// failed says nothing about the tool, and so is an installer that answered with neither a
// result nor an error. The comparison is version.UpdateStatus, so the
// CLI's tool check, its tool update and the dashboard cannot disagree about a tool.
func ClassifyCheck(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult, checkErr error) (CheckResult, error) {
	if errors.Is(checkErr, installer.ErrUpdateCheckUnsupported) {
		return CheckResult{Status: CheckStatusUnsupported, InstalledVersion: installedVersion}, nil
	}
	if checkErr == nil && res == nil {
		checkErr = errNoCheckResult
	}
	if checkErr != nil {
		return CheckResult{}, fmt.Errorf("checking update for %q: %w", tool.Name, checkErr)
	}
	result := CheckResult{InstalledVersion: installedVersion, LatestVersion: res.LatestVersion, Cached: res.Cached}
	result.Status = compareInstalled(tool, installedVersion, res)
	return result, nil
}

// compareInstalled is the status of an installation at installedVersion against what
// the installer resolved upstream, res.
func compareInstalled(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult) CheckStatus {
	var latest string
	var outdated *bool
	if res != nil {
		latest, outdated = res.LatestVersion, res.Outdated
	}
	switch version.UpdateStatus(version.UpdateQuery{
		Installed:  installedVersion,
		Latest:     latest,
		Constraint: tool.UpdateCheckConstraint(),
		Outdated:   outdated,
	}) {
	case version.StatusNewerAvailable:
		return CheckStatusUpdateAvailable
	case version.StatusAheadOfLatest:
		return CheckStatusAheadOfLatest
	default:
		return CheckStatusUpToDate
	}
}

// errNoCheckResult is the failure of an installer whose CheckUpdate returned neither a
// result nor an error: nothing was learned about the tool, so it is not up to date.
var errNoCheckResult = errors.New("the installer returned no update check result")
