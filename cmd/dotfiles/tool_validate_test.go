package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// writeValidationConfig writes a configuration whose paths live under a temp dir
// and returns its path. toolConfigs is the body of the "toolConfigs" object.
func writeValidationConfig(t *testing.T, toolConfigs string) string {
	t.Helper()
	dir := t.TempDir()
	content := fmt.Sprintf(`{"projectConfig": {"paths": {"homeDir": %q, "targetDir": %q, "generatedDir": %q, "dotfilesDir": %q}}, "toolConfigs": {%s}}`,
		filepath.Join(dir, "home"), filepath.Join(dir, "target"), filepath.Join(dir, "generated"), dir, toolConfigs)
	path := filepath.Join(dir, "dotfiles.config.json")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}
	return path
}

func TestValidateCommand_ParameterRules(t *testing.T) {
	tests := []struct {
		name        string
		toolConfigs string
		wantOutput  string
		wantErr     bool
	}{
		{
			name:        "github-release needs a repo",
			toolConfigs: `"gh": {"name": "gh", "installationMethod": "github-release"}`,
			wantOutput:  "'github-release' installer requires a 'repo' parameter",
			wantErr:     true,
		},
		{
			name:        "github-release repo needs an owner",
			toolConfigs: `"gh": {"name": "gh", "installationMethod": "github-release", "installParams": {"repo": "norepo"}}`,
			wantOutput:  `Invalid 'repo' parameter "norepo" for github-release`,
			wantErr:     true,
		},
		{
			name:        "gitea-release needs a repo",
			toolConfigs: `"gt": {"name": "gt", "installationMethod": "gitea-release"}`,
			wantOutput:  "'gitea-release' installer requires a 'repo' parameter",
			wantErr:     true,
		},
		{
			name:        "curl-script needs a url",
			toolConfigs: `"cs": {"name": "cs", "installationMethod": "curl-script"}`,
			wantOutput:  "'curl-script' installer requires a 'url' parameter",
			wantErr:     true,
		},
		{
			name:        "zsh-plugin needs a repo or url",
			toolConfigs: `"zp": {"name": "zp", "installationMethod": "zsh-plugin"}`,
			wantOutput:  "'zsh-plugin' installer requires a 'repo' or 'url' parameter",
			wantErr:     true,
		},
		{
			name:        "PATH must not be set through env",
			toolConfigs: `"sh": {"name": "sh", "installationMethod": "manual", "shellConfigs": {"zsh": {"env": {"PATH": "/x"}}}}`,
			wantOutput:  "zsh shell config sets PATH via .env() — use .path() instead",
			wantErr:     true,
		},
		{
			name:        "unknown dependency is a warning",
			toolConfigs: `"dep": {"name": "dep", "installationMethod": "manual", "dependencies": ["ghost"]}`,
			wantOutput:  `Declared dependency "ghost" is not found among configured tools`,
		},
		{
			name:        "missing installation method is a warning",
			toolConfigs: `"bare": {"name": "bare"}`,
			wantOutput:  "No installation method specified",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand("-c", writeValidationConfig(t, tt.toolConfigs), "tool", "validate")
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v\n%s", err, tt.wantErr, out.Combined)
			}
			if !strings.Contains(out.Stdout, tt.wantOutput) {
				t.Fatalf("stdout does not contain %q:\n%s", tt.wantOutput, out.Stdout)
			}
		})
	}
}

func TestValidateCommand_Reporting(t *testing.T) {
	// One error (no repo) and one warning (unknown dependency) on the same tool.
	configPath := writeValidationConfig(t, `"gh": {"name": "gh", "installationMethod": "github-release", "dependencies": ["ghost"]}`)

	t.Run("human mode lists warnings then errors", func(t *testing.T) {
		out, err := runCommand("-c", configPath, "tool", "validate")
		if err == nil || !strings.Contains(err.Error(), "validation failed with 1 error(s)") {
			t.Fatalf("error = %v, want validation failure", err)
		}
		if !strings.Contains(out.Stdout, "[WARN] 1 warning(s) found:\n") || !strings.Contains(out.Stdout, "[ERROR] 1 validation error(s) found:\n") {
			t.Fatalf("stdout lacks the warning and error sections:\n%s", out.Stdout)
		}
	})

	t.Run("agent mode prefixes each line", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := runCommand("-c", configPath, "tool", "validate")
		if err == nil {
			t.Fatalf("expected validation failure:\n%s", out.Combined)
		}
		if !strings.Contains(out.Stdout, "WARN: [") || !strings.Contains(out.Stdout, "ERR: [") {
			t.Fatalf("stdout lacks WARN:/ERR: lines:\n%s", out.Stdout)
		}
	})

	t.Run("json reports invalid and still fails", func(t *testing.T) {
		out, err := runCommand("-c", configPath, "tool", "validate", "--json")
		if err == nil {
			t.Fatalf("expected validation failure:\n%s", out.Combined)
		}
		if !strings.Contains(out.Stdout, `"valid": false`) {
			t.Fatalf("stdout does not report valid=false:\n%s", out.Stdout)
		}
	})
}

func TestValidateCommand_ValidConfig(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	out, err := executeCommand("-c", configPath, "tool", "validate")
	if err != nil {
		t.Fatalf("validate command failed: %v", err)
	}
	if !strings.Contains(out, "Checked") || !strings.Contains(out, "all valid") {
		t.Errorf("expected validate output to show checked tools and valid result, got:\n%s", out)
	}
}

func TestValidateCommand_SpecificTool(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	out, err := executeCommand("-c", configPath, "tool", "validate", "bat")
	if err != nil {
		t.Fatalf("validate bat failed: %v", err)
	}
	if !strings.Contains(out, "Checked 1 tool configuration") {
		t.Errorf("expected 1 checked tool, got:\n%s", out)
	}
}

func TestValidateCommand_NonExistentTool(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	_, err := executeCommand("-c", configPath, "tool", "validate", "non-existent-tool")
	if err == nil {
		t.Errorf("expected validate non-existent-tool to return an error")
	}
}

func TestValidateCommand_InvalidMethod(t *testing.T) {
	tmpDir := t.TempDir()
	configContent := `{
	"projectConfig": {"paths": {` + projectPathsJSON(tmpDir) + `}},
	"toolConfigs": {
		"badtool": {
			"name": "badtool",
			"installationMethod": "invalid-installer-method"
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config failed: %v", err)
	}

	// The JSON configuration loads through config.ValidateToolConfigs like a TypeScript
	// one, so the method is rejected while loading, naming the file and the valid methods.
	out, err := executeCommand("-c", configPath, "tool", "validate")
	if err == nil {
		t.Fatalf("expected validate with invalid installer method to fail, got out:\n%s", out)
	}
	for _, want := range []string{filepath.Base(configPath), `unknown installation method "invalid-installer-method"`, strings.Join(config.InstallMethods(), ", ")} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected the error to mention %q, got: %v", want, err)
		}
	}
}

func TestValidateCommand_AptWithoutSudoWarning(t *testing.T) {
	tmpDir := t.TempDir()
	configContent := `{
	"projectConfig": {"paths": {` + projectPathsJSON(tmpDir) + `}},
	"toolConfigs": {
		"apttool": {
			"name": "apttool",
			"installationMethod": "apt"
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config failed: %v", err)
	}

	out, err := executeCommand("-c", configPath, "tool", "validate")
	if err != nil {
		t.Fatalf("validate apt without sudo failed unexpectedly: %v", err)
	}
	if !strings.Contains(out, "usually requires .sudo() elevation") {
		t.Errorf("expected warning about .sudo() elevation, got:\n%s", out)
	}
}

func TestValidateCommand_JSON_HumanAndAgent(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	t.Run("human mode json pretty", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		out, err := executeCommand("-c", configPath, "tool", "validate", "--json")
		if err != nil {
			t.Fatalf("validate --json failed: %v", err)
		}
		if !strings.Contains(out, "  \"valid\": true") {
			t.Errorf("expected pretty-printed JSON in human mode, got:\n%s", out)
		}
	})

	t.Run("agent mode json minified", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", configPath, "tool", "validate", "--json")
		if err != nil {
			t.Fatalf("validate --json failed: %v", err)
		}
		trimmed := strings.TrimSpace(out)
		if strings.Contains(trimmed, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", out)
		}
		if !strings.Contains(trimmed, "{\"checked\":") {
			t.Errorf("expected minified valid JSON output, got:\n%s", out)
		}
	})

	t.Run("agent mode text output", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", configPath, "tool", "validate")
		if err != nil {
			t.Fatalf("validate in agent mode failed: %v", err)
		}
		if !strings.Contains(out, "OK: 1 tools valid") {
			t.Errorf("expected 'OK: 1 tools valid' in agent mode, got:\n%s", out)
		}
	})
}

func TestValidateCommand_CrossToolConflicts(t *testing.T) {
	conflictsJSON := `"flutter": {
		"name": "flutter",
		"installationMethod": "manual",
		"shellConfigs": {
			"zsh": {
				"aliases": {
					"fd": "flutter doctor"
				}
			}
		}
	},
	"fd": {
		"name": "fd",
		"installationMethod": "manual",
		"binaries": [{"name": "fd"}]
	}`

	cfgPath := writeValidationConfig(t, conflictsJSON)

	t.Run("human mode reports conflict warning", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		out, err := runCommand("-c", cfgPath, "tool", "validate")
		if err != nil {
			t.Fatalf("unexpected error on validate with warnings: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, `[WARN] 1 warning(s) found:`) {
			t.Fatalf("expected warning header, got:\n%s", out.Stdout)
		}
		if !strings.Contains(out.Stdout, `alias "fd" ('flutter doctor') shadows binary "fd" from fd`) {
			t.Fatalf("expected conflict warning text, got:\n%s", out.Stdout)
		}
	})

	t.Run("agent mode reports WARN line", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := runCommand("-c", cfgPath, "tool", "validate")
		if err != nil {
			t.Fatalf("unexpected error on validate with warnings: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, `WARN: [] flutter: alias "fd" ('flutter doctor') shadows binary "fd" from fd`) {
			t.Fatalf("expected WARN line in agent mode, got:\n%s", out.Stdout)
		}
	})
}
