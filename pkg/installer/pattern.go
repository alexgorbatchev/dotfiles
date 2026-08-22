package installer

import (
	"path/filepath"
	"regexp"
	"strings"
)

// MatchAssetPattern checks whether a filename matches an asset pattern.
// Supports slash-delimited regex (/regex/i), glob pattern (*, ?, [), regex, and substring matching.
func MatchAssetPattern(name, pattern string) bool {
	if pattern == "" {
		return true
	}

	// Case 1: Slash-delimited regex, e.g. "/pattern/i" or "/pattern/"
	if strings.HasPrefix(pattern, "/") {
		lastSlash := strings.LastIndex(pattern, "/")
		if lastSlash > 0 {
			regexStr := pattern[1:lastSlash]
			flags := pattern[lastSlash+1:]
			if strings.Contains(flags, "i") {
				regexStr = "(?i)" + regexStr
			}
			if re, err := regexp.Compile(regexStr); err == nil {
				return re.MatchString(name)
			}
		}
	}

	// Case 2: Glob matching if pattern contains glob metacharacters (*, ?, [)
	if strings.ContainsAny(pattern, "*?[") {
		globPattern := strings.ReplaceAll(pattern, "[!", "[^")
		matched, err := filepath.Match(strings.ToLower(globPattern), strings.ToLower(name))
		if err == nil && matched {
			return true
		}
	}

	// Case 3: Regex matching
	if re, err := regexp.Compile(pattern); err == nil {
		if re.MatchString(name) {
			return true
		}
	}

	// Case 4: Substring matching (case-insensitive)
	return strings.Contains(strings.ToLower(name), strings.ToLower(pattern))
}

// matchPattern is a package-internal alias for MatchAssetPattern.
func matchPattern(name, pattern string) bool {
	return MatchAssetPattern(name, pattern)
}
