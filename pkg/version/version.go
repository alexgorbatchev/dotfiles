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
