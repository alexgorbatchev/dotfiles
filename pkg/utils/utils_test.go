package utils

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestContains(t *testing.T) {
	tests := []struct {
		name   string
		slice  []string
		target string
		want   bool
	}{
		{"empty slice", []string{}, "a", false},
		{"element exists", []string{"a", "b", "c"}, "b", true},
		{"element does not exist", []string{"a", "b", "c"}, "d", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Contains(tt.slice, tt.target); got != tt.want {
				t.Errorf("Contains() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUnique(t *testing.T) {
	tests := []struct {
		name  string
		slice []int
		want  []int
	}{
		{"empty", []int{}, []int{}},
		{"nil", nil, nil},
		{"no duplicates", []int{1, 2, 3}, []int{1, 2, 3}},
		{"duplicates", []int{1, 2, 1, 3, 2, 4}, []int{1, 2, 3, 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Unique(tt.slice); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("Unique() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFilter(t *testing.T) {
	tests := []struct {
		name      string
		slice     []int
		predicate func(int) bool
		want      []int
	}{
		{"empty", []int{}, func(x int) bool { return x > 0 }, []int{}},
		{"nil", nil, func(x int) bool { return x > 0 }, nil},
		{"filter evens", []int{1, 2, 3, 4, 5}, func(x int) bool { return x%2 == 0 }, []int{2, 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Filter(tt.slice, tt.predicate); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("Filter() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNormalizePlatform(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"darwin", "macos"},
		{"macos", "macos"},
		{"MAC", "macos"},
		{"linux", "linux"},
		{"windows", "windows"},
		{"win32", "windows"},
		{"win", "windows"},
		{"none", "none"},
		{"", "none"},
		{"other", "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := NormalizePlatform(tt.input); got != tt.want {
				t.Errorf("NormalizePlatform(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalizeArch(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"x64", "amd64"},
		{"amd64", "amd64"},
		{"x86_64", "amd64"},
		{"arm64", "arm64"},
		{"aarch64", "arm64"},
		{"none", "none"},
		{"", "none"},
		{"other", "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := NormalizeArch(tt.input); got != tt.want {
				t.Errorf("NormalizeArch(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestExpandHomePath(t *testing.T) {
	tests := []struct {
		name    string
		homeDir string
		path    string
		want    string
	}{
		{"only tilde", "/home/user", "~", "/home/user"},
		{"tilde with slash", "/home/user", "~/foo", filepath.Join("/home/user", "foo")},
		{"tilde with backslash", "/home/user", "~\\foo", filepath.Join("/home/user", "foo")},
		{"no tilde", "/home/user", "/etc/foo", "/etc/foo"},
		{"relative path", "/home/user", "./foo", "./foo"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExpandHomePath(tt.homeDir, tt.path); got != tt.want {
				t.Errorf("ExpandHomePath() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestContractHomePath(t *testing.T) {
	tests := []struct {
		name    string
		homeDir string
		path    string
		want    string
	}{
		{"empty homeDir", "", "/home/user/foo", "/home/user/foo"},
		{"exact match", "/home/user", "/home/user", "~"},
		{"with subpath", "/home/user", "/home/user/foo/bar", "~/foo/bar"},
		{"no prefix", "/home/user", "/etc/foo", "/etc/foo"},
		{"prefix match but not directory boundary", "/home/user", "/home/userprefix", "/home/userprefix"},
		{"trailing slash in homeDir", "/home/user/", "/home/user", "~"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ContractHomePath(tt.homeDir, tt.path); got != tt.want {
				t.Errorf("ContractHomePath() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveToolRelativePath(t *testing.T) {
	tests := []struct {
		name      string
		toolDir   string
		inputPath string
		want      string
	}{
		{"absolute path", "/etc", "/foo/bar", "/foo/bar"},
		{"relative path", "/etc", "foo/bar", filepath.Clean("/etc/foo/bar")},
		{"relative path with dot", "/etc", "./foo/bar", filepath.Clean("/etc/foo/bar")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveToolRelativePath(tt.toolDir, tt.inputPath); got != tt.want {
				t.Errorf("ResolveToolRelativePath() = %q, want %q", got, tt.want)
			}
		})
	}
}
