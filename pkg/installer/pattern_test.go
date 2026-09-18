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
			name:     "Glob wildcard with negation [!s]",
			fileName: "atuin-x86_64-unknown-linux-gnu.tar.gz",
			pattern:  "atuin-[!s]*.tar.gz",
			expected: true,
		},
		{
			name:     "Glob wildcard with negation [!s] rejecting atuin-server",
			fileName: "atuin-server-x86_64-unknown-linux-gnu.tar.gz",
			pattern:  "atuin-[!s]*.tar.gz",
			expected: false,
		},
		{
			name:     "JS negative lookahead pattern for bun",
			fileName: "bun-linux-x64.zip",
			pattern:  `/^(?!.*-profile).*\.zip$/`,
			expected: true,
		},
		{
			name:     "JS negative lookahead pattern rejecting profile asset",
			fileName: "bun-linux-x64-baseline-profile.zip",
			pattern:  `/^(?!.*-profile).*\.zip$/`,
			expected: false,
		},
		{
			name:     "Brace alternation *.{tar.xz,zip} matches tar.xz",
			fileName: "md-tui-aarch64-apple-darwin.tar.xz",
			pattern:  "*.{tar.xz,zip}",
			expected: true,
		},
		{
			name:     "Brace alternation *.{tar.xz,zip} matches zip",
			fileName: "md-tui-x86_64-pc-windows-msvc.zip",
			pattern:  "*.{tar.xz,zip}",
			expected: true,
		},
		{
			name:     "Brace alternation *.{tar.xz,zip} rejects tar.gz",
			fileName: "source.tar.gz",
			pattern:  "*.{tar.xz,zip}",
			expected: false,
		},
		{
			name:     "Brace alternation without other glob metacharacters",
			fileName: "tool-linux-amd64",
			pattern:  "tool-{linux,darwin}-amd64",
			expected: true,
		},
		{
			name:     "Brace alternation without other glob metacharacters rejects other OS",
			fileName: "tool-windows-amd64",
			pattern:  "tool-{linux,darwin}-amd64",
			expected: false,
		},
		{
			name:     "Nested brace alternation",
			fileName: "tool-linux-amd64.tar.xz",
			pattern:  "*.{tar.{gz,xz},zip}",
			expected: true,
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

func TestExpandBraces(t *testing.T) {
	tests := []struct {
		pattern string
		want    []string
	}{
		{"*.tar.gz", []string{"*.tar.gz"}},
		{"*.{tar.xz,zip}", []string{"*.tar.xz", "*.zip"}},
		{"{,*/}tool", []string{"tool", "*/tool"}},
		{"*.{tar.{gz,xz},zip}", []string{"*.tar.gz", "*.tar.xz", "*.zip"}},
		{"{a,b}-{1,2}", []string{"a-1", "a-2", "b-1", "b-2"}},
		{"tool{x}.zip", []string{"tool{x}.zip"}},
		{"tool{x}.{zip,gz}", []string{"tool{x}.zip", "tool{x}.gz"}},
		{"tool{a,b", []string{"tool{a,b"}},
		{"tool}a,b{", []string{"tool}a,b{"}},
	}
	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			got := expandBraces(tt.pattern)
			if len(got) != len(tt.want) {
				t.Fatalf("expandBraces(%q) = %q, want %q", tt.pattern, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("expandBraces(%q) = %q, want %q", tt.pattern, got, tt.want)
				}
			}
		})
	}
}
