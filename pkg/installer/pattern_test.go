package installer

import "testing"

func TestMatchAssetPattern(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		pattern  string
		expected bool
	}{
		{
			name:     "Empty pattern matches everything",
			fileName: "yazi-x86_64-unknown-linux-gnu.zip",
			pattern:  "",
			expected: true,
		},
		{
			name:     "Glob wildcard yazi-*.zip",
			fileName: "yazi-x86_64-unknown-linux-gnu.zip",
			pattern:  "yazi-*.zip",
			expected: true,
		},
		{
			name:     "Glob wildcard yazi-*.zip non-matching extension",
			fileName: "yazi-x86_64-unknown-linux-gnu.tar.gz",
			pattern:  "yazi-*.zip",
			expected: false,
		},
		{
			name:     "Glob wildcard *linux_amd64.tar.gz",
			fileName: "mytool_linux_amd64.tar.gz",
			pattern:  "*linux_amd64.tar.gz",
			expected: true,
		},
		{
			name:     "Glob wildcard *macos*.dmg case insensitive",
			fileName: "MyApp-v1.2-macOS-arm64.dmg",
			pattern:  "*macos*.dmg",
			expected: true,
		},
		{
			name:     "Slash-delimited regex case insensitive",
			fileName: "YAZI-x86_64-unknown-linux-gnu.ZIP",
			pattern:  "/yazi-.*\\.zip/i",
			expected: true,
		},
		{
			name:     "Direct regex ending in .deb",
			fileName: "mytool-linux-amd64.deb",
			pattern:  `\.deb$`,
			expected: true,
		},
		{
			name:     "Direct regex ending in .sha256",
			fileName: "mytool-linux-amd64.sha256",
			pattern:  `\.sha256$`,
			expected: true,
		},
		{
			name:     "Direct regex containing tar.gz",
			fileName: "mytool-v1.0.tar.gz",
			pattern:  `.*tar\.gz`,
			expected: true,
		},
		{
			name:     "Substring match",
			fileName: "mytool-linux-amd64.tar.gz",
			pattern:  "linux",
			expected: true,
		},
		{
			name:     "Non-matching substring",
			fileName: "mytool-darwin-amd64.tar.gz",
			pattern:  "linux",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MatchAssetPattern(tt.fileName, tt.pattern)
			if got != tt.expected {
				t.Errorf("MatchAssetPattern(%q, %q) = %v; want %v", tt.fileName, tt.pattern, got, tt.expected)
			}
		})
	}
}
