package orchestrator

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
)

// UpdateCheckUnsupportedMessage is what an update or a check reports for a tool whose
// installer answered installer.ErrUpdateCheckUnsupported: nothing upstream was asked,
// so the tool is neither up to date nor outdated as far as dotfiles knows.
func UpdateCheckUnsupportedMessage(tool *config.ToolConfig) string {
	return fmt.Sprintf("Update check not supported for installer %q", tool.InstallationMethod)
}

// UpdatePlan is what an update decided for one installed tool from its installer's
// answer and whether a reinstall was forced. The CLI's tool update and the dashboard's
// update route both act on it, so the two cannot disagree about a tool.
type UpdatePlan struct {
	// Status is what the update check found (ClassifyCheck).
	Status           CheckStatus
	Force            bool
	InstalledVersion string
	// LatestVersion is the newest version the installer resolved upstream.
	LatestVersion string
	// TargetVersion is the version the reinstall asks for; empty asks for none, and the
	// installation then records what the installer detects or a fresh timestamp.
	TargetVersion string
}

// Reinstall reports whether the tool is installed again. A tool whose installer cannot
// check for updates is always reinstalled, as v1 did, since nothing else can bring it
// up to date; a caller that should leave such tools alone skips them before acting.
func (p UpdatePlan) Reinstall() bool {
	return p.Status == CheckStatusUnsupported || p.Status == CheckStatusUpdateAvailable || p.Force
}

// Announcement says why the tool is about to be reinstalled. Callers log it as a
// warning when Status is CheckStatusUnsupported and as information otherwise.
func (p UpdatePlan) Announcement(tool *config.ToolConfig) string {
	switch p.Status {
	case CheckStatusUnsupported:
		return UpdateCheckUnsupportedMessage(tool) + ", performing regular install instead"
	case CheckStatusUpdateAvailable:
		return fmt.Sprintf("New version available: %s -> %s", p.InstalledVersion, p.TargetVersion)
	case CheckStatusAheadOfLatest:
		return fmt.Sprintf("Force updating: reinstalling installed version %s, which is ahead of the latest known version (%s)", p.InstalledVersion, p.LatestVersion)
	default:
		return fmt.Sprintf("Force updating: reinstalling version %s", p.TargetVersion)
	}
}

// Completion says what the reinstall did once the installation recorded recorded: an
// update when a newer version was available or nothing could be checked, and a
// reinstall of the same version when only --force asked for one.
func (p UpdatePlan) Completion(recorded string) string {
	if p.Status == CheckStatusUpToDate || p.Status == CheckStatusAheadOfLatest {
		return fmt.Sprintf("Successfully reinstalled version %s", recorded)
	}
	return fmt.Sprintf("Successfully updated to version %s", recorded)
}

// TargetDescription names what the reinstall installs, for messages about it: the
// target version, or nothing when the installation decides which version it records.
func (p UpdatePlan) TargetDescription() string {
	if p.TargetVersion == "" {
		return ""
	}
	return " to version " + p.TargetVersion
}

// PlanUpdate answers what an update does for tool, installed at installedVersion, given
// what its installer's CheckUpdate returned. installer.ErrUpdateCheckUnsupported is a
// plan to reinstall without asking for a version; any other checkErr is returned,
// wrapped, since an update check that failed says nothing about the tool.
func PlanUpdate(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult, checkErr error, force bool) (UpdatePlan, error) {
	check, err := ClassifyCheck(tool, installedVersion, res, checkErr)
	if err != nil {
		return UpdatePlan{}, err
	}
	return UpdatePlan{
		Status:           check.Status,
		Force:            force,
		InstalledVersion: installedVersion,
		LatestVersion:    check.LatestVersion,
		TargetVersion:    updateTarget(tool, check),
	}, nil
}

// updateTarget answers which version an update, or a forced reinstall, of the tool
// check describes should install.
//
// A tool whose configuration pins a version never gets here: its update is refused
// first (config.ToolConfig.UpdateRefusal).
//
// An installed version ahead of the latest release is reinstalled as it is: the older
// release is not an update, and a forced reinstall is a repair, never a downgrade.
//
// An empty target means the reinstall asks for no particular version. That is the
// answer for a tool whose installer cannot check upstream: such an installer has no
// version to be asked for, and the version recorded by the previous installation is
// either one the installer detected then or a timestamp generated then. Reusing it
// would override what the installer detects now and freeze a generated timestamp at
// the first installation, so, as v1 did, the installation records the detected
// version or a fresh timestamp instead.
func updateTarget(tool *config.ToolConfig, check CheckResult) string {
	latest, installed := check.LatestVersion, check.InstalledVersion
	// "unknown" and "latest" are placeholders rather than versions, and a release the
	// tool's constraint excludes is not one an update may install onto the machine.
	installable := latest != "" && latest != "unknown" && latest != "latest" && version.MatchesConstraint(latest, tool.UpdateCheckConstraint())
	switch {
	case check.Status == CheckStatusUnsupported:
		// Nothing upstream answered, so the installation decides what it records.
		return ""
	case check.Status == CheckStatusAheadOfLatest:
		return installed
	case installable:
		return latest
	case installed != "" && installed != "unknown":
		return installed
	default:
		return utils.GenerateTimestamp()
	}
}

// ApplyUpdate carries out plan for tool and returns the version the installation
// recorded. The update has already decided the tool is installed again, so it is
// installed even when the existing installation is healthy, as v1's update did by
// always installing with force. The release plan targets is installed from a copy of
// tool (config.ToolConfig.WithRequestedVersion), so tool itself is never written.
func (o *Orchestrator) ApplyUpdate(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig, plan UpdatePlan) (string, error) {
	if plan.TargetVersion != "" {
		tool = tool.WithRequestedVersion(plan.TargetVersion)
	}
	if err := o.InstallTool(config.WithForce(ctx, true), tool, projCfg); err != nil {
		return "", err
	}
	rec, err := o.reg.GetToolInstallation(ctx, tool.Name)
	if err != nil {
		return "", fmt.Errorf("%q was installed, but reading its installation record failed: %w", tool.Name, err)
	}
	// A dry run records nothing, so the target is all there is to report.
	if rec == nil || rec.Version == "" || rec.Version == "unknown" {
		return plan.TargetVersion, nil
	}
	return rec.Version, nil
}
