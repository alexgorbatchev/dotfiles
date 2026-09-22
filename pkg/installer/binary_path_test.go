package installer

import (
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// manual, curl-script and the orchestrator all read binaryPath, and resolve it with the
// same helper so they cannot come to disagree about where a path written in a tool file
// points. The rules are v1's expandToolConfigPath.
func TestResolveBinaryPath(t *testing.T) {
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	projCfg.Paths.DotfilesDir = "/home/user/dotfiles"
	projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"

	tests := []struct {
		name       string
		binaryPath string
		configFile string
		want       string
		plainFS    bool
		wantErr    []string
	}{
		{name: "unset", binaryPath: "", want: ""},
		{name: "absolute", binaryPath: "/opt/tool/bin/tool", want: "/opt/tool/bin/tool"},
		{name: "home", binaryPath: "~/.local/bin/tool", want: "/home/user/.local/bin/tool"},
		{name: "placeholder", binaryPath: "{paths.homeDir}/bin/tool", want: "/home/user/bin/tool"},
		{name: "home without a resolving filesystem", binaryPath: "~/.local/bin/tool", plainFS: true, want: "/home/user/.local/bin/tool"},
		{name: "relative without a tool file", binaryPath: "vendor/tool", want: "/home/user/dotfiles/vendor/tool"},
		{name: "relative to the tool file", binaryPath: "./vendor/tool", configFile: "/dotfiles/tools/tool.tool.ts", want: "/dotfiles/tools/vendor/tool"},
		{name: "unknown placeholder", binaryPath: "{configFileDir}/tool", wantErr: []string{"tool", "binaryPath", "{configFileDir}"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := &config.ToolConfig{Name: "tool", ConfigFilePath: tt.configFile, InstallParams: map[string]interface{}{}}
			if tt.binaryPath != "" {
				tool.InstallParams["binaryPath"] = tt.binaryPath
			}

			var fsys fs.FS = fs.NewResolvedFS(fs.NewMemFS(), "/home/user")
			if tt.plainFS {
				fsys = fs.NewMemFS()
			}
			got, err := ResolveBinaryPath(fsys, tool, projCfg)
			if len(tt.wantErr) > 0 {
				if err == nil {
					t.Fatalf("ResolveBinaryPath() = %q, want an error", got)
				}
				for _, want := range tt.wantErr {
					if !strings.Contains(err.Error(), want) {
						t.Errorf("ResolveBinaryPath() error = %v, want it to name %q", err, want)
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("ResolveBinaryPath() error = %v", err)
			}
			if got != tt.want {
				t.Errorf("ResolveBinaryPath() = %q, want %q", got, tt.want)
			}
		})
	}
}
