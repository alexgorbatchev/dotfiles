package version

import (
	"fmt"
	"strings"

	"golang.org/x/mod/semver"
)

// VersionComparisonStatus represents the relationship between the currently configured version
// and the latest upstream version.
type VersionComparisonStatus int

const (
	StatusInvalidCurrent VersionComparisonStatus = iota
	StatusInvalidLatest
	StatusNewerAvailable
	StatusUpToDate
	StatusAheadOfLatest
)

// CleanVersion ensures a version string is formatted with a single 'v' prefix for proper
// semantic validation by golang.org/x/mod/semver.
func CleanVersion(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = "v" + v
	return v
}

// ParseVersion extracts a normalized clean version string without 'v' prefix.
func ParseVersion(v string) string {
	v = strings.TrimSpace(v)
	return strings.TrimPrefix(v, "v")
}

// CheckVersionStatus compares current and latest version strings.
// Returns status indicating if latest is newer, up-to-date, or if either is invalid.
func CheckVersionStatus(current, latest string) VersionComparisonStatus {
	cleanCurrent := CleanVersion(current)
	cleanLatest := CleanVersion(latest)

	if !semver.IsValid(cleanCurrent) {
		return StatusInvalidCurrent
	}
	if !semver.IsValid(cleanLatest) {
		return StatusInvalidLatest
	}

	comp := semver.Compare(cleanLatest, cleanCurrent)
	if comp > 0 {
		return StatusNewerAvailable
	}
	if comp < 0 {
		return StatusAheadOfLatest
	}
	return StatusUpToDate
}

// UpdateQuery carries everything the question "is an update available?" depends on.
// It exists so every caller asks that question the same way instead of reimplementing
// the comparison next to whichever installer result it happens to hold.
type UpdateQuery struct {
	// Installed is the version currently on the machine, empty when nothing is recorded.
	Installed string
	// Latest is the newest version the installer resolved upstream, empty when it
	// resolved none.
	Latest string
	// Constraint is the tool's updateCheck.constraint: a semver range bounding which
	// versions count as an available update. Empty accepts any version.
	Constraint string
	// Outdated is a package manager's own verdict where one exists (brew, apt, dnf,
	// pacman). nil means no such verdict and the versions decide.
	Outdated *bool
}

// UpdateAvailable reports whether Latest counts as an available update over Installed.
//
// A constraint is a boundary the user asked for, so it is applied first: a version
// outside it is not an update however new it is. A package manager that answered the
// question itself is believed next, because its version strings (Debian epochs, rpm
// releases, brew revisions) are not semver and only it can order them. Otherwise the
// versions decide, and a pair semver cannot parse is compared for inequality, which is
// the most two unordered labels support.
func UpdateAvailable(q UpdateQuery) bool {
	if q.Constraint != "" && !MatchesConstraint(q.Latest, q.Constraint) {
		return false
	}
	if q.Outdated != nil {
		return *q.Outdated
	}
	if q.Latest == "" {
		return false
	}
	if q.Installed == "" {
		return true
	}
	switch CheckVersionStatus(q.Installed, q.Latest) {
	case StatusNewerAvailable:
		return true
	case StatusInvalidCurrent, StatusInvalidLatest:
		return CleanVersion(q.Latest) != CleanVersion(q.Installed)
	default:
		return false
	}
}

// MatchesConstraint parses and evaluates an NPM-style SemVer constraint expression (e.g. ^1.2.3, ~1.2.3, >=1.0.0, etc.)
// returning true if the version satisfies the constraint boundary rules.
func MatchesConstraint(versionStr string, constraint string) bool {
	constraint = strings.TrimSpace(constraint)
	if constraint == "" || constraint == "*" || constraint == "latest" {
		return true
	}

	cleanVer := CleanVersion(versionStr)
	if !semver.IsValid(cleanVer) {
		return false
	}

	// Support caret compatible range: compatible with the given version (e.g., ^1.2.3 is >=1.2.3 and <2.0.0)
	if strings.HasPrefix(constraint, "^") {
		base := CleanVersion(constraint[1:])
		if !semver.IsValid(base) {
			return false
		}
		if semver.Compare(cleanVer, base) < 0 {
			return false
		}

		baseNoV := strings.TrimPrefix(base, "v")
		if idx := strings.IndexAny(baseNoV, "-+"); idx != -1 {
			baseNoV = baseNoV[:idx]
		}

		var major, minor, patch int
		_, _ = fmt.Sscanf(baseNoV, "%d.%d.%d", &major, &minor, &patch)

		var limit string
		if major > 0 {
			limit = fmt.Sprintf("v%d.0.0", major+1)
		} else if minor > 0 {
			limit = fmt.Sprintf("v0.%d.0", minor+1)
		} else {
			limit = fmt.Sprintf("v0.0.%d", patch+1)
		}

		return semver.Compare(cleanVer, limit) < 0
	}

	// Support tilde range: compatible with minor releases (e.g., ~1.2.3 is >=1.2.3 and <1.3.0)
	if strings.HasPrefix(constraint, "~") {
		base := CleanVersion(constraint[1:])
		if !semver.IsValid(base) {
			return false
		}
		if semver.Compare(cleanVer, base) < 0 {
			return false
		}
		var majorNum, minorNum int
		_, _ = fmt.Sscanf(base, "v%d.%d", &majorNum, &minorNum)
		nextMinor := fmt.Sprintf("v%d.%d.0", majorNum, minorNum+1)
		return semver.Compare(cleanVer, nextMinor) < 0
	}

	// Support operators (>=, <=, >, <)
	if strings.HasPrefix(constraint, ">=") {
		base := CleanVersion(constraint[2:])
		return semver.IsValid(base) && semver.Compare(cleanVer, base) >= 0
	}
	if strings.HasPrefix(constraint, "<=") {
		base := CleanVersion(constraint[2:])
		return semver.IsValid(base) && semver.Compare(cleanVer, base) <= 0
	}
	if strings.HasPrefix(constraint, ">") {
		base := CleanVersion(constraint[1:])
		return semver.IsValid(base) && semver.Compare(cleanVer, base) > 0
	}
	if strings.HasPrefix(constraint, "<") {
		base := CleanVersion(constraint[1:])
		return semver.IsValid(base) && semver.Compare(cleanVer, base) < 0
	}

	// Default to exact match comparison
	exact := CleanVersion(constraint)
	return semver.IsValid(exact) && semver.Compare(cleanVer, exact) == 0
}
