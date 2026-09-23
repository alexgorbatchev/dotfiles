package config

import (
	"os"
	"regexp"
	"strings"
)

// MatchesHostname reports whether the machine running the command is the one a
// tool's hostname pattern names. An empty pattern names every machine, a pattern
// written between slashes is a regular expression, and anything else matches a
// hostname equal to or containing it.
func MatchesHostname(pattern string) bool {
	current, err := os.Hostname()
	if err != nil {
		return false
	}
	if pattern == "" {
		return true
	}

	if len(pattern) >= 2 && strings.HasPrefix(pattern, "/") && strings.HasSuffix(pattern, "/") {
		body := pattern[1 : len(pattern)-1]
		re, err := regexp.Compile(body)
		if err != nil {
			return current == pattern
		}
		return re.MatchString(current)
	}

	return current == pattern || strings.Contains(current, pattern)
}

// IsActive reports whether a run on this machine carries the tool out: it is not
// disabled, and any hostname it is scoped to names this machine.
func (tc *ToolConfig) IsActive() bool {
	return !tc.Disabled && (tc.Hostname == "" || MatchesHostname(tc.Hostname))
}
