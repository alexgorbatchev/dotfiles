package installer

import (
	"path"
	"regexp"
	"strings"
)

// ParseSlashRegex parses a slash-delimited regex pattern (e.g. "/foo.*bar/i") into the inner pattern, flags, and whether it was valid slash syntax.
func ParseSlashRegex(pattern string) (inner string, flags string, ok bool) {
	if len(pattern) < 2 || !strings.HasPrefix(pattern, "/") {
		return "", "", false
	}
	lastSlash := -1
	for i := len(pattern) - 1; i > 0; i-- {
		if pattern[i] == '/' {
			candidateFlags := pattern[i+1:]
			isValidFlags := true
			seenFlags := make(map[rune]bool)
			for _, ch := range candidateFlags {
				if !strings.ContainsRune("dgimsuy", ch) || seenFlags[ch] {
					isValidFlags = false
					break
				}
				seenFlags[ch] = true
			}
			if isValidFlags {
				lastSlash = i
				flags = candidateFlags
				break
			}
		}
	}
	if lastSlash <= 0 {
		return "", "", false
	}

	inner = pattern[1:lastSlash]
	if inner == "" {
		return "", "", false
	}

	// Verify all intermediate slashes in inner are escaped with backslash
	for i := 0; i < len(inner); i++ {
		if inner[i] == '/' {
			// Count consecutive backslashes preceding this slash
			backslashes := 0
			for j := i - 1; j >= 0 && inner[j] == '\\'; j-- {
				backslashes++
			}
			if backslashes%2 == 0 {
				// Even number of backslashes means the slash is unescaped (e.g. /usr/bin/gum)
				return "", "", false
			}
		}
	}

	return inner, flags, true
}

// MatchAssetPattern checks whether a filename matches an asset pattern.
// Supports slash-delimited regex (/regex/i), glob pattern (*, ?, [), regex, and substring matching.
func MatchAssetPattern(name, pattern string) bool {
	if pattern == "" {
		return true
	}

	// Case 1: Slash-delimited regex, e.g. "/pattern/i" or "/pattern/"
	if regexStr, flags, ok := ParseSlashRegex(pattern); ok {
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

	// Case 2: Glob matching if pattern contains glob metacharacters (*, ?, [, {).
	// Asset names are not filesystem paths, so path.Match is used rather than
	// filepath.Match: its escaping does not change with the host's path separator.
	if strings.ContainsAny(pattern, "*?[{") {
		globPattern := strings.ReplaceAll(pattern, "[!", "[^")
		for _, alternative := range expandBraces(globPattern) {
			matched, err := path.Match(strings.ToLower(alternative), strings.ToLower(name))
			if err == nil && matched {
				return true
			}
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

// expandBraces expands brace alternation the way minimatch (the v1 matcher) does, so
// "*.{tar.xz,zip}" becomes "*.tar.xz" and "*.zip". Groups may nest and several groups
// multiply out left to right. A group without a comma and an unbalanced brace are kept as
// literal text, again matching minimatch. Numeric ranges such as {1..3} are not supported.
func expandBraces(pattern string) []string {
	open := strings.IndexByte(pattern, '{')
	if open < 0 {
		return []string{pattern}
	}

	depth := 0
	segmentStart := open + 1
	var alternatives []string
	for i := open; i < len(pattern); i++ {
		switch pattern[i] {
		case '{':
			depth++
		case ',':
			if depth == 1 {
				alternatives = append(alternatives, pattern[segmentStart:i])
				segmentStart = i + 1
			}
		case '}':
			depth--
			if depth != 0 {
				continue
			}
			alternatives = append(alternatives, pattern[segmentStart:i])
			prefix, rest := pattern[:open], pattern[i+1:]
			if len(alternatives) == 1 {
				// "{x}" is not an alternation; keep it literally and carry on after it.
				literal := pattern[:i+1]
				var out []string
				for _, tail := range expandBraces(rest) {
					out = append(out, literal+tail)
				}
				return out
			}
			var out []string
			for _, alternative := range alternatives {
				for _, tail := range expandBraces(alternative + rest) {
					out = append(out, prefix+tail)
				}
			}
			return out
		}
	}

	// The brace never closed at depth zero: treat the pattern as literal text.
	return []string{pattern}
}

// matchPattern is a package-internal alias for MatchAssetPattern.
func matchPattern(name, pattern string) bool {
	return MatchAssetPattern(name, pattern)
}
