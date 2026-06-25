package config

import (
	"strings"
	"testing"
)

func TestResolvePlaceholders(t *testing.T) {
	projCfg := &ProjectConfig{
		Paths: PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "{paths.homeDir}/bin",
			GeneratedDir: "{paths.homeDir}/.generated",
			BinariesDir:  "{paths.generatedDir}/binaries",
		},
	}

	tests := []struct {
		name      string
		input     string
		toolName  string
		want      string
		wantErr   bool
		errSubstr string
	}{
		{
			name:     "simple resolve",
			input:    "{paths.homeDir}/test",
			toolName: "mytool",
			want:     "/home/user/test",
			wantErr:  false,
		},
		{
			name:     "nested resolve",
			input:    "{stagingDir}/config",
			toolName: "mytool",
			want:     "/home/user/.generated/binaries/mytool/current/config",
			wantErr:  false,
		},
		{
			name:     "cyclic reference direct",
			input:    "{paths.targetDir}",
			toolName: "mytool",
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := projCfg
			if tt.name == "cyclic reference direct" {
				cfg = &ProjectConfig{
					Paths: PathsConfig{
						HomeDir:      "/home/user",
						TargetDir:    "{paths.generatedDir}/bin",
						GeneratedDir: "{paths.targetDir}/generated",
					},
				}
			}

			got, err := ResolvePlaceholders(tt.input, tt.toolName, cfg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ResolvePlaceholders() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("ResolvePlaceholders() = %q, want %q", got, tt.want)
			}
			if tt.wantErr && tt.errSubstr != "" && !strings.Contains(err.Error(), tt.errSubstr) {
				t.Errorf("expected error containing %q, got %q", tt.errSubstr, err.Error())
			}
		})
	}
}
