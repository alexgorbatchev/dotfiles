package utils

import (
	"path/filepath"
	"strings"
	"time"
)

// Contains returns true if the slice contains the target value.
func Contains[T comparable](slice []T, target T) bool {
	for _, v := range slice {
		if v == target {
			return true
		}
	}
	return false
}

// Unique returns a new slice containing only unique elements from the input slice,
// preserving the original order of first occurrence.
func Unique[T comparable](slice []T) []T {
	if len(slice) == 0 {
		return slice
	}
	seen := make(map[T]struct{}, len(slice))
	result := make([]T, 0, len(slice))
	for _, v := range slice {
		if _, ok := seen[v]; !ok {
			seen[v] = struct{}{}
			result = append(result, v)
		}
	}
	return result
}

// Filter returns a new slice containing all elements that satisfy the predicate.
func Filter[T any](slice []T, predicate func(T) bool) []T {
	if len(slice) == 0 {
		return slice
	}
	result := make([]T, 0, len(slice))
	for _, v := range slice {
		if predicate(v) {
			result = append(result, v)
		}
	}
	return result
}

// NormalizePlatform parses and maps platform string variants to canonical forms
// ("macos", "linux", "windows", or "unknown").
func NormalizePlatform(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "darwin", "macos", "mac":
		return "macos"
	case "linux":
		return "linux"
	case "windows", "win32", "win":
		return "windows"
	case "none", "":
		return "none"
	default:
		return "unknown"
	}
}

// NormalizeArch parses and maps CPU architecture string variants to canonical forms
// ("amd64", "arm64", or "unknown").
func NormalizeArch(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "x64", "amd64", "x86_64":
		return "amd64"
	case "arm64", "aarch64":
		return "arm64"
	case "none", "":
		return "none"
	default:
		return "unknown"
	}
}

// ExpandHomePath expands the tilde (~) prefix, $HOME, or ${HOME} in file paths to the provided home directory.
func ExpandHomePath(homeDir string, path string) string {
	if homeDir == "" {
		return path
	}
	if path == "~" || path == "$HOME" || path == "${HOME}" {
		return homeDir
	}
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
		return filepath.Join(homeDir, path[2:])
	}
	if strings.HasPrefix(path, "$HOME/") || strings.HasPrefix(path, "$HOME\\") {
		return filepath.Join(homeDir, path[6:])
	}
	if strings.HasPrefix(path, "${HOME}/") || strings.HasPrefix(path, "${HOME}\\") {
		return filepath.Join(homeDir, path[8:])
	}
	return path
}

// ContractHomePath replaces the home directory prefix with ~ for cleaner, user-facing logging.
func ContractHomePath(homeDir string, path string) string {
	if homeDir == "" {
		return path
	}
	if path == homeDir {
		return "~"
	}

	// Ensure uniform separator handling
	cleanHome := filepath.Clean(homeDir)
	cleanPath := filepath.Clean(path)

	if strings.HasPrefix(cleanPath, cleanHome) {
		remainder := cleanPath[len(cleanHome):]
		if remainder == "" {
			return "~"
		}
		if remainder[0] == '/' || remainder[0] == '\\' {
			return "~" + remainder
		}
	}
	return path
}

// IsAbsOrHome returns true if the path is an absolute path or starts with a user home alias (~, $HOME, ${HOME}).
func IsAbsOrHome(path string) bool {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return false
	}
	if filepath.IsAbs(trimmed) {
		return true
	}
	if trimmed == "~" || strings.HasPrefix(trimmed, "~/") || strings.HasPrefix(trimmed, "~\\") {
		return true
	}
	if trimmed == "$HOME" || strings.HasPrefix(trimmed, "$HOME/") || strings.HasPrefix(trimmed, "$HOME\\") {
		return true
	}
	if trimmed == "${HOME}" || strings.HasPrefix(trimmed, "${HOME}/") || strings.HasPrefix(trimmed, "${HOME}\\") {
		return true
	}
	return false
}

// ResolveToolRelativePath resolves relative paths against the tool configuration directory (toolDir).
// Absolute paths and user-home paths are returned cleaned and as-is.
func ResolveToolRelativePath(toolDir string, inputPath string) string {
	trimmed := strings.TrimSpace(inputPath)
	if IsAbsOrHome(trimmed) {
		return filepath.Clean(trimmed)
	}
	return filepath.Clean(filepath.Join(toolDir, trimmed))
}

// DedentString strips common leading whitespace from all lines in a string.
func DedentString(s string) string {
	lines := strings.Split(s, "\n")
	var nonEmptyLines []string
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			nonEmptyLines = append(nonEmptyLines, line)
		}
	}

	if len(nonEmptyLines) == 0 {
		return s
	}

	minIndent := -1
	for _, line := range nonEmptyLines {
		indent := 0
		for _, ch := range line {
			if ch == ' ' || ch == '\t' {
				indent++
			} else {
				break
			}
		}
		if minIndent == -1 || indent < minIndent {
			minIndent = indent
		}
	}

	if minIndent <= 0 {
		return strings.TrimSpace(s)
	}

	resultLines := make([]string, len(lines))
	for i, line := range lines {
		if len(line) >= minIndent {
			resultLines[i] = line[minIndent:]
		} else {
			resultLines[i] = ""
		}
	}

	return strings.TrimSpace(strings.Join(resultLines, "\n"))
}

// GenerateTimestamp returns a formatted timestamp string (YYYY-MM-DD-HH-MM-SS)
// suitable for versioning and directory names when explicit versions are unavailable.
func GenerateTimestamp(times ...time.Time) string {
	t := time.Now()
	if len(times) > 0 {
		t = times[0]
	}
	return t.Format("2006-01-02-15-04-05")
}

