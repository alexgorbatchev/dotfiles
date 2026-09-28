package config

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPlatformAndArchitectureNames(t *testing.T) {
	tests := []struct {
		platforms []string
		in        int
	}{
		{in: 0, platforms: []string{}},
		{in: PlatformLinux, platforms: []string{"Linux"}},
		{in: PlatformMacOS, platforms: []string{"macOS"}},
		{in: PlatformWindows, platforms: []string{"Windows"}},
		{in: PlatformLinux | PlatformMacOS, platforms: []string{"Linux", "macOS"}},
	}
	for _, tt := range tests {
		got := PlatformNames(tt.in)
		if len(got) != len(tt.platforms) {
			t.Errorf("PlatformNames(%d) = %v, want %v", tt.in, got, tt.platforms)
			continue
		}
		for i := range got {
			if got[i] != tt.platforms[i] {
				t.Errorf("PlatformNames(%d)[%d] = %q, want %q", tt.in, i, got[i], tt.platforms[i])
			}
		}
	}

	archTests := []struct {
		archs []string
		in    int
	}{
		{in: 0, archs: []string{}},
		{in: ArchX86_64, archs: []string{"x86_64"}},
		{in: ArchArm64, archs: []string{"arm64"}},
		{in: ArchAll, archs: []string{"x86_64", "arm64"}},
	}
	for _, tt := range archTests {
		got := ArchitectureNames(tt.in)
		if len(got) != len(tt.archs) {
			t.Errorf("ArchitectureNames(%d) = %v, want %v", tt.in, got, tt.archs)
			continue
		}
		for i := range got {
			if got[i] != tt.archs[i] {
				t.Errorf("ArchitectureNames(%d)[%d] = %q, want %q", tt.in, i, got[i], tt.archs[i])
			}
		}
	}
}

func TestInactivePlatformConfigBranchName(t *testing.T) {
	arm64 := ArchArm64
	tests := []struct {
		name string
		ipc  InactivePlatformConfig
		want string
	}{
		{
			name: "explicit branch name",
			ipc:  InactivePlatformConfig{Branch: "custom-branch"},
			want: "custom-branch",
		},
		{
			name: "platform only",
			ipc:  InactivePlatformConfig{Platforms: PlatformLinux},
			want: "platform Linux",
		},
		{
			name: "arch only",
			ipc:  InactivePlatformConfig{Architectures: &arm64},
			want: "arch arm64",
		},
		{
			name: "platform and arch",
			ipc:  InactivePlatformConfig{Platforms: PlatformLinux, Architectures: &arm64},
			want: "platform Linux, arch arm64",
		},
		{
			name: "unconstrained / empty",
			ipc:  InactivePlatformConfig{},
			want: "inactive branch",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ipc.BranchName(); got != tt.want {
				t.Errorf("BranchName() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestInactivePlatformConfigUnmarshalJSON(t *testing.T) {
	t.Run("defaults install params", func(t *testing.T) {
		input := `{"installationMethod":"zsh-plugin","installParams":{"repo":"test/repo"}}`
		var ipc InactivePlatformConfig
		if err := json.Unmarshal([]byte(input), &ipc); err != nil {
			t.Fatalf("Unmarshal failed: %v", err)
		}
		if ipc.InstallParams["auto"] != true {
			t.Errorf("expected auto: true default, got: %v", ipc.InstallParams["auto"])
		}
	})

	t.Run("rejects unknown fields", func(t *testing.T) {
		input := `{"unknownField":"bad"}`
		var ipc InactivePlatformConfig
		if err := json.Unmarshal([]byte(input), &ipc); err == nil {
			t.Fatal("expected unmarshal to fail on unknown field")
		}
	})
}

func TestInactivePlatformConfigValidateDeclarations(t *testing.T) {
	tests := []struct {
		name       string
		ipc        InactivePlatformConfig
		wantErrMsg string
	}{
		{
			name: "valid inactive platform config",
			ipc: InactivePlatformConfig{
				Platforms:          PlatformLinux,
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "/usr/bin/tool"},
				Blocks:             []BlockConfig{{Target: "~/.bashrc", ID: "linux-blk"}},
			},
			wantErrMsg: "",
		},
		{
			name: "invalid install method",
			ipc: InactivePlatformConfig{
				Platforms:          PlatformLinux,
				InstallationMethod: "bad-method",
			},
			wantErrMsg: `tool "probe" (platform Linux): unknown installation method "bad-method"`,
		},
		{
			name: "invalid install param leading dash",
			ipc: InactivePlatformConfig{
				Platforms:          PlatformLinux,
				InstallationMethod: "apt",
				InstallParams:      map[string]interface{}{"package": "-bad-pkg"},
			},
			wantErrMsg: `tool "probe" (platform Linux): package "-bad-pkg" cannot start with '-'`,
		},
		{
			name: "invalid symlink mode",
			ipc: InactivePlatformConfig{
				Platforms: PlatformLinux,
				Symlinks:  []SymlinkConfig{{Source: "./src", Target: "./dst", Mode: "invalid"}},
			},
			wantErrMsg: `invalid symlink in tool "probe" (platform Linux): mode "invalid" is not an octal permission`,
		},
		{
			name: "invalid copy conflict",
			ipc: InactivePlatformConfig{
				Platforms: PlatformLinux,
				Copies:    []CopyConfig{{Source: "./src", Target: "./dst", Conflict: "invalid"}},
			},
			wantErrMsg: `invalid copy in tool "probe" (platform Linux): conflict "invalid" is not one of`,
		},
		{
			name: "invalid directory mode",
			ipc: InactivePlatformConfig{
				Platforms:   PlatformLinux,
				Directories: []DirectoryConfig{{Path: "~/.dir", Mode: "invalid"}},
			},
			wantErrMsg: `invalid directory in tool "probe" (platform Linux): mode "invalid" is not an octal permission`,
		},
		{
			name: "invalid block id",
			ipc: InactivePlatformConfig{
				Platforms: PlatformLinux,
				Blocks:    []BlockConfig{{Target: "~/.bashrc", ID: "bad id with spaces"}},
			},
			wantErrMsg: `invalid block in tool "probe" (platform Linux): block id "bad id with spaces" may only contain`,
		},
		{
			name: "invalid template conflict",
			ipc: InactivePlatformConfig{
				Platforms: PlatformLinux,
				Templates: []TemplateConfig{{Source: "./src", Target: "./dst", Conflict: "invalid"}},
			},
			wantErrMsg: `invalid template in tool "probe" (platform Linux): conflict "invalid" is not one of`,
		},
		{
			name: "invalid shell config script kind",
			ipc: InactivePlatformConfig{
				Platforms: PlatformLinux,
				ShellConfigs: &ShellConfigs{
					Zsh: &ShellTypeConfig{
						Scripts: []ShellScript{{Kind: "bogus", Value: "echo hello"}},
					},
				},
			},
			wantErrMsg: `invalid shell config in tool "probe" (platform Linux): shell script kind must be one of`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.ipc.Validate("probe")
			if tt.wantErrMsg == "" {
				if err != nil {
					t.Fatalf("expected nil error, got: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrMsg)
			}
			if !strings.Contains(err.Error(), tt.wantErrMsg) {
				t.Errorf("expected error containing %q, got: %v", tt.wantErrMsg, err)
			}
		})
	}
}

func TestToolConfigValidateWithInactivePlatformConfigs(t *testing.T) {
	tc := &ToolConfig{
		Name:           "mytool",
		ConfigFilePath: "tools/mytool.tool.ts",
		InactivePlatformConfigs: []InactivePlatformConfig{
			{
				Platforms: PlatformLinux,
				Blocks:    []BlockConfig{{Target: "~/.bashrc", ID: "bad id"}},
			},
		},
	}

	err := ValidateToolConfigs([]*ToolConfig{tc}, nil)
	if err == nil {
		t.Fatal("expected ValidateToolConfigs to fail")
	}

	for _, want := range []string{"tools/mytool.tool.ts", `tool "mytool"`, "platform Linux", `block id "bad id"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected error to contain %q, got: %v", want, err)
		}
	}
}
