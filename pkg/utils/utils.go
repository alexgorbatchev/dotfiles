package utils

import (
	"path/filepath"
	"strings"
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

// ExpandHomePath expands the tilde (~) prefix in file paths to the provided home directory.
func ExpandHomePath(homeDir string, path string) string {
	if path == "~" {
		return homeDir
	}
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(homeDir, path[2:])
	}
	if strings.HasPrefix(path, "~\\") {
		return filepath.Join(homeDir, path[2:])
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

// ResolveToolRelativePath resolves relative paths against the tool configuration directory (toolDir).
// Absolute paths are returned cleaned and as-is.
func ResolveToolRelativePath(toolDir string, inputPath string) string {
	trimmed := strings.TrimSpace(inputPath)
	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed)
	}
	return filepath.Clean(filepath.Join(toolDir, trimmed))
}
