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
		lastSlash := -1
		for i := len(pattern) - 1; i > 0; i-- {
			if pattern[i] == '/' {
				flags := pattern[i+1:]
				isValidFlags := true
				for _, ch := range flags {
					if !strings.ContainsRune("igmsuy", ch) {
						isValidFlags = false
						break
					}
				}
				if isValidFlags {
					lastSlash = i
					break
				}
			}
		}

		if lastSlash > 0 {
			regexStr := pattern[1:lastSlash]
			flags := pattern[lastSlash+1:]

			// Handle JS negative lookahead syntax (?!.*SUB) not natively supported by Go RE2
			var excludeTerms []string
			lookaheadRe := regexp.MustCompile(`\(\?!\.\*([^\)]+)\)`)
			for _, m := range lookaheadRe.FindAllStringSubmatch(regexStr, -1) {
				if len(m) > 1 {
					excludeTerms = append(excludeTerms, m[1])
				}
			}
			regexStrClean := lookaheadRe.ReplaceAllString(regexStr, "")

			if strings.Contains(flags, "i") {
				regexStrClean = "(?i)" + regexStrClean
			}

			if re, err := regexp.Compile(regexStrClean); err == nil {
				if re.MatchString(name) {
					for _, exc := range excludeTerms {
						if strings.Contains(strings.ToLower(name), strings.ToLower(exc)) {
							return false
						}
					}
					return true
				}
				return false
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
