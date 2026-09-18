package config

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// A matcher constrains only the fields it names, so an omitted field matches any
// value, and the architecture accepts the Go spelling "amd64" as well as "x86_64".
func TestPlatformMatchMatches(t *testing.T) {
	tests := []struct {
		name  string
		match PlatformMatch
		os    string
		arch  string
		want  bool
	}{
		{name: "os only matches any arch", match: PlatformMatch{OS: "macos"}, os: "darwin", arch: "amd64", want: true},
		{name: "os only rejects another os", match: PlatformMatch{OS: "macos"}, os: "linux", arch: "arm64", want: false},
		{name: "arch only matches any os", match: PlatformMatch{Arch: "arm64"}, os: "linux", arch: "arm64", want: true},
		{name: "arch only rejects another arch", match: PlatformMatch{Arch: "arm64"}, os: "linux", arch: "amd64", want: false},
		{name: "both must hold", match: PlatformMatch{OS: "macos", Arch: "arm64"}, os: "darwin", arch: "arm64", want: true},
		{name: "both, arch differs", match: PlatformMatch{OS: "macos", Arch: "arm64"}, os: "darwin", arch: "amd64", want: false},
		{name: "both, os differs", match: PlatformMatch{OS: "macos", Arch: "arm64"}, os: "linux", arch: "arm64", want: false},
		{name: "x86_64 spelling matches amd64 target", match: PlatformMatch{Arch: "x86_64"}, os: "linux", arch: "amd64", want: true},
		{name: "x86_64 spelling matches x86_64 target", match: PlatformMatch{Arch: "x86_64"}, os: "linux", arch: "x86_64", want: true},
		{name: "windows", match: PlatformMatch{OS: "windows"}, os: "windows", arch: "amd64", want: true},
		{name: "linux", match: PlatformMatch{OS: "linux"}, os: "linux", arch: "amd64", want: true},
		{name: "unknown os name never matches", match: PlatformMatch{OS: "darwin"}, os: "darwin", arch: "arm64", want: false},
		{name: "unknown arch name never matches", match: PlatformMatch{Arch: "aarch64"}, os: "darwin", arch: "arm64", want: false},
		{name: "zero value selects nothing", match: PlatformMatch{}, os: "darwin", arch: "arm64", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.match.Matches(tt.os, tt.arch); got != tt.want {
				t.Errorf("%+v.Matches(%q, %q) = %v, want %v", tt.match, tt.os, tt.arch, got, tt.want)
			}
		})
	}
}

func TestApplyPlatformOverrides(t *testing.T) {
	tests := []struct {
		name string
		in   string
		os   string
		arch string
		want string
	}{
		{
			name: "no platform key leaves the configuration alone",
			in:   `{"paths":{"targetDir":"/usr/local/bin"}}`,
			os:   "darwin",
			arch: "arm64",
			want: `{"paths":{"targetDir":"/usr/local/bin"}}`,
		},
		{
			name: "matching override is merged and the platform list is removed",
			in: `{
				"paths": {"targetDir": "/usr/local/bin", "dotfilesDir": "/dots"},
				"platform": [
					{"match": [{"os": "macos", "arch": "arm64"}], "config": {"paths": {"targetDir": "/opt/homebrew/bin"}}}
				]
			}`,
			os:   "darwin",
			arch: "arm64",
			want: `{"paths":{"dotfilesDir":"/dots","targetDir":"/opt/homebrew/bin"}}`,
		},
		{
			name: "non-matching override is skipped but the platform list is still removed",
			in: `{
				"paths": {"targetDir": "/usr/local/bin"},
				"platform": [
					{"match": [{"os": "macos", "arch": "arm64"}], "config": {"paths": {"targetDir": "/opt/homebrew/bin"}}}
				]
			}`,
			os:   "linux",
			arch: "amd64",
			want: `{"paths":{"targetDir":"/usr/local/bin"}}`,
		},
		{
			name: "an override applies when any of its matchers matches",
			in: `{
				"paths": {"targetDir": "/usr/local/bin"},
				"platform": [
					{"match": [{"os": "windows"}, {"arch": "arm64"}], "config": {"paths": {"targetDir": "/arm/bin"}}}
				]
			}`,
			os:   "linux",
			arch: "arm64",
			want: `{"paths":{"targetDir":"/arm/bin"}}`,
		},
		{
			name: "later matching overrides win over earlier ones",
			in: `{
				"paths": {"targetDir": "/usr/local/bin"},
				"platform": [
					{"match": [{"os": "macos"}], "config": {"paths": {"targetDir": "/mac/bin"}, "system": {"sudoPrompt": "mac"}}},
					{"match": [{"arch": "arm64"}], "config": {"paths": {"targetDir": "/arm/bin"}}}
				]
			}`,
			os:   "darwin",
			arch: "arm64",
			want: `{"paths":{"targetDir":"/arm/bin"},"system":{"sudoPrompt":"mac"}}`,
		},
		{
			name: "nested objects merge while scalars and arrays are replaced",
			in: `{
				"paths": {"toolConfigsDir": ["/a", "/b"], "targetDir": "/usr/local/bin"},
				"github": {"host": "https://api.github.com", "cache": {"enabled": true, "ttl": 1}},
				"platform": [
					{"match": [{"os": "linux"}], "config": {
						"paths": {"toolConfigsDir": ["/c"]},
						"github": {"cache": {"enabled": false}}
					}}
				]
			}`,
			os:   "linux",
			arch: "amd64",
			want: `{"github":{"cache":{"enabled":false,"ttl":1},"host":"https://api.github.com"},"paths":{"targetDir":"/usr/local/bin","toolConfigsDir":["/c"]}}`,
		},
		{
			name: "an override may introduce a section the base configuration lacks",
			in: `{
				"paths": {"targetDir": "/usr/local/bin"},
				"platform": [
					{"match": [{"os": "linux"}], "config": {"features": {"shellInstall": {"bash": "~/.bashrc"}}}}
				]
			}`,
			os:   "linux",
			arch: "amd64",
			want: `{"features":{"shellInstall":{"bash":"~/.bashrc"}},"paths":{"targetDir":"/usr/local/bin"}}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ApplyPlatformOverrides([]byte(tt.in), tt.os, tt.arch)
			if err != nil {
				t.Fatalf("ApplyPlatformOverrides returned error: %v", err)
			}
			if !jsonEqual(t, got, []byte(tt.want)) {
				t.Errorf("ApplyPlatformOverrides(%s) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}

	t.Run("invalid JSON is reported", func(t *testing.T) {
		if _, err := ApplyPlatformOverrides([]byte(`{ not json`), "darwin", "arm64"); err == nil {
			t.Fatal("expected an error for malformed JSON")
		}
	})

	// The caller is expected to validate first; a platform value that never passed
	// validation is still reported rather than silently dropped.
	t.Run("unvalidated platform shape is reported", func(t *testing.T) {
		_, err := ApplyPlatformOverrides([]byte(`{"platform": {"match": [], "config": {}}}`), "darwin", "arm64")
		if err == nil {
			t.Fatal("expected an error for a platform value that is not a list")
		}
		if !strings.Contains(err.Error(), "decoding platform overrides") {
			t.Errorf("unexpected error: %v", err)
		}
	})
}

// jsonEqual compares two JSON documents structurally, so key order is irrelevant.
func jsonEqual(t *testing.T, a, b []byte) bool {
	t.Helper()
	var av, bv interface{}
	if err := json.Unmarshal(a, &av); err != nil {
		t.Fatalf("unmarshaling %s: %v", a, err)
	}
	if err := json.Unmarshal(b, &bv); err != nil {
		t.Fatalf("unmarshaling %s: %v", b, err)
	}
	return reflect.DeepEqual(av, bv)
}
