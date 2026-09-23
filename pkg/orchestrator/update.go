package orchestrator

import (
	"context"
	"errors"
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
	// Unsupported is set when the installer answered installer.ErrUpdateCheckUnsupported.
	Unsupported      bool
	HasUpdate        bool
	Force            bool
	InstalledVersion string
	// TargetVersion is the version the reinstall asks for; empty asks for none, and the
	// installation then records what the installer detects or a fresh timestamp.
	TargetVersion string
}

// Reinstall reports whether the tool is installed again. A tool whose installer cannot
// check for updates is always reinstalled, as v1 did, since nothing else can bring it
// up to date; a caller that should leave such tools alone skips them before acting.
func (p UpdatePlan) Reinstall() bool {
	return p.Unsupported || p.HasUpdate || p.Force
}

// Announcement says why the tool is about to be reinstalled. Callers log it as a
// warning when Unsupported is set and as information otherwise.
func (p UpdatePlan) Announcement(tool *config.ToolConfig) string {
	switch {
	case p.Unsupported:
		return UpdateCheckUnsupportedMessage(tool) + ", performing regular install instead"
	case p.HasUpdate:
		return fmt.Sprintf("New version available: %s -> %s", p.InstalledVersion, p.TargetVersion)
	default:
		return fmt.Sprintf("Force updating: reinstalling version %s", p.TargetVersion)
	}
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
	unsupported := errors.Is(checkErr, installer.ErrUpdateCheckUnsupported)
	if checkErr != nil && !unsupported {
		return UpdatePlan{}, fmt.Errorf("checking update for %q: %w", tool.Name, checkErr)
	}
	if unsupported {
		res = nil
	}
	hasUpdate, targetVersion := resolveUpdate(tool, installedVersion, res)
	return UpdatePlan{
		Unsupported:      unsupported,
		HasUpdate:        hasUpdate,
		Force:            force,
		InstalledVersion: installedVersion,
		TargetVersion:    targetVersion,
	}, nil
}

// resolveUpdate answers whether an update is available for tool and which version an
// update, or a forced reinstall, should install. res is nil when the installer answered
// nothing. The availability decision is version.UpdateAvailable, the same one
// check-updates and the dashboard's check-update route make.
//
// A tool whose configuration pins a version never gets here: its update is refused
// first (config.ToolConfig.UpdateRefusal).
//
// An empty target means the reinstall asks for no particular version. That is the
// answer for a tool whose installer cannot check upstream: such an installer has no
// version to be asked for, and the version recorded by the previous installation is
// either one the installer detected then or a timestamp generated then. Reusing it
// would override what the installer detects now and freeze a generated timestamp at
// the first installation, so, as v1 did, the installation records the detected
// version or a fresh timestamp instead.
func resolveUpdate(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult) (hasUpdate bool, targetVersion string) {
	var latest string
	var outdated *bool
	if res != nil {
		latest, outdated = res.LatestVersion, res.Outdated
	}
	constraint := tool.UpdateCheckConstraint()

	hasUpdate = version.UpdateAvailable(version.UpdateQuery{
		Installed:  installedVersion,
		Latest:     latest,
		Constraint: constraint,
		Outdated:   outdated,
	})

	// "unknown" and "latest" are placeholders rather than versions, and a release the
	// tool's constraint excludes is not one an update may install onto the machine.
	installable := latest != "" && latest != "unknown" && latest != "latest" && version.MatchesConstraint(latest, constraint)
	switch {
	case installable:
		targetVersion = latest
	case res == nil:
		// Nothing upstream answered, so the installation decides what it records.
	case installedVersion != "" && installedVersion != "unknown":
		targetVersion = installedVersion
	default:
		targetVersion = utils.GenerateTimestamp()
	}

	return hasUpdate, targetVersion
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
