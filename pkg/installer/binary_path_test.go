package installer

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// manual and curl-script both read binaryPath, and resolve it with the same helper so
// the two cannot come to disagree about where a path written in a tool file points.
func TestResolveBinaryPath(t *testing.T) {
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"
	ctx := config.WithProjectConfig(context.Background(), projCfg)

	tests := []struct {
		name       string
		binaryPath string
		configFile string
		want       string
		wantErr    []string
	}{
		{name: "unset", binaryPath: "", want: ""},
		{name: "absolute", binaryPath: "/opt/tool/bin/tool", want: "/opt/tool/bin/tool"},
		{name: "home", binaryPath: "~/.local/bin/tool", want: "/home/user/.local/bin/tool"},
		{name: "placeholder", binaryPath: "{paths.homeDir}/bin/tool", want: "/home/user/bin/tool"},
		{name: "relative to the tool file", binaryPath: "./vendor/tool", configFile: "/dotfiles/tools/tool.tool.ts", want: "/dotfiles/tools/vendor/tool"},
		{name: "unknown placeholder", binaryPath: "{configFileDir}/tool", wantErr: []string{"tool", "binaryPath", "{configFileDir}"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := &config.ToolConfig{Name: "tool", ConfigFilePath: tt.configFile, InstallParams: map[string]interface{}{}}
			if tt.binaryPath != "" {
				tool.InstallParams["binaryPath"] = tt.binaryPath
			}

			got, err := resolveBinaryPath(ctx, fs.NewResolvedFS(fs.NewMemFS(), "/home/user"), tool)
			if len(tt.wantErr) > 0 {
				if err == nil {
					t.Fatalf("resolveBinaryPath() = %q, want an error", got)
				}
				for _, want := range tt.wantErr {
					if !strings.Contains(err.Error(), want) {
						t.Errorf("resolveBinaryPath() error = %v, want it to name %q", err, want)
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveBinaryPath() error = %v", err)
			}
			if got != tt.want {
				t.Errorf("resolveBinaryPath() = %q, want %q", got, tt.want)
			}
		})
	}
}
