package main

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// writeValidationConfig writes a project whose paths live under a temp dir and returns
// its configuration path.
func writeValidationConfig(t *testing.T, tools tsTools) string {
	t.Helper()
	dir := t.TempDir()
	return writeTSProject(t, dir, fmt.Sprintf(`"paths": {%s, "dotfilesDir": %q}`, projectPathsTS(dir), dir), tools)
}

func TestValidateCommand_ParameterRules(t *testing.T) {
	tests := []struct {
		name       string
		tools      tsTools
		wantOutput string
		wantErr    bool
	}{
		{
			name:       "github-release needs a repo",
			tools:      tsTools{"gh": `install("github-release")`},
			wantOutput: "'github-release' installer requires a 'repo' parameter",
			wantErr:    true,
		},
		{
			name:       "github-release repo needs an owner",
			tools:      tsTools{"gh": `install("github-release", { repo: "norepo" })`},
			wantOutput: `Invalid 'repo' parameter "norepo" for github-release`,
			wantErr:    true,
		},
		{
			name:       "gitea-release needs a repo",
			tools:      tsTools{"gt": `install("gitea-release")`},
			wantOutput: "'gitea-release' installer requires a 'repo' parameter",
			wantErr:    true,
		},
		{
			name:       "curl-script needs a url",
			tools:      tsTools{"cs": `install("curl-script")`},
			wantOutput: "'curl-script' installer requires a 'url' parameter",
			wantErr:    true,
		},
		{
			name:       "zsh-plugin needs a repo or url",
			tools:      tsTools{"zp": `install("zsh-plugin")`},
			wantOutput: "'zsh-plugin' installer requires a 'repo' or 'url' parameter",
			wantErr:    true,
		},
		{
			name:       "PATH must not be set through env",
			tools:      tsTools{"sh": `install("manual").zsh((shell) => shell.env({ PATH: "/x" }))`},
			wantOutput: "zsh shell config sets PATH via .env() — use .path() instead",
			wantErr:    true,
		},
		{
			name:       "unknown dependency is a warning",
			tools:      tsTools{"dep": `install("manual").dependsOn("ghost")`},
			wantOutput: `Declared dependency "ghost" is not found among configured tools`,
		},
		{
			name:       "missing installation method is a warning",
			tools:      tsTools{"bare": `install()`},
			wantOutput: "No installation method specified",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand("-c", writeValidationConfig(t, tt.tools), "tool", "validate")
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
	configPath := writeValidationConfig(t, tsTools{"gh": `install("github-release").dependsOn("ghost")`})

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
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")

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
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")

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
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")

	_, err := executeCommand("-c", configPath, "tool", "validate", "non-existent-tool")
	if err == nil {
		t.Errorf("expected validate non-existent-tool to return an error")
	}
}

// An unknown installation method is rejected while the configuration loads, naming the
// tool file and the valid methods.
func TestValidateCommand_InvalidMethod(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`,
		tsTools{"badtool": `install("invalid-installer-method")`})

	out, err := executeCommand("-c", configPath, "tool", "validate")
	if err == nil {
		t.Fatalf("expected validate with invalid installer method to fail, got out:\n%s", out)
	}
	toolFile := filepath.Join(tmpDir, "tools", "badtool.tool.ts")
	for _, want := range []string{toolFile, `unknown installation method "invalid-installer-method"`, strings.Join(config.InstallMethods(), ", ")} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected the error to mention %q, got: %v", want, err)
		}
	}
}

// Two tools claiming one file are compared against the resolved paths: the home
// directory here is itself a placeholder, so the two spellings only meet once the
// project paths are resolved.
func TestValidateCommand_ToolsSharingABlock(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := writeTSProject(t, tmpDir, `"paths": {
		"generatedDir": `+strconv.Quote(filepath.Join(tmpDir, "generated"))+`,
		"homeDir": "{paths.generatedDir}/home",
		"targetDir": `+strconv.Quote(filepath.Join(tmpDir, "target"))+`,
	}`, tsTools{
		"alpha": `install().block("~/shared.conf", { id: "main", content: "from alpha" })`,
		"beta":  `install().block("{paths.homeDir}/shared.conf", { id: "main", content: "from beta" })`,
	})

	out, err := executeCommand("-c", configPath, "tool", "validate")
	if err == nil {
		t.Fatalf("expected validate with two tools sharing a block to fail, got out:\n%s", out)
	}
	for _, want := range []string{filepath.Base(configPath), `tool "alpha"`, `tool "beta"`, filepath.Join(tmpDir, "generated", "home", "shared.conf")} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected the error to mention %q, got: %v", want, err)
		}
	}
}

func TestValidateCommand_AptWithoutSudoWarning(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`,
		tsTools{"apttool": `install("apt")`})

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
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")

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
	cfgPath := writeValidationConfig(t, tsTools{
		"flutter": `install("manual").zsh((shell) => shell.aliases({ fd: "flutter doctor" }))`,
		"fd":      `install("manual").bin("fd")`,
	})

	t.Run("human mode reports conflict warning", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		out, err := runCommand("-c", cfgPath, "tool", "validate")
		if err != nil {
			t.Fatalf("unexpected error on validate with warnings: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, `[WARN] 1 warning(s) found:`) {
			t.Fatalf("expected warning header, got:\n%s", out.Stdout)
		}
		if !strings.Contains(out.Stdout, `- [tools/flutter.tool.ts] flutter: alias "fd" ('flutter doctor') shadows binary "fd" from tools/fd.tool.ts`) {
			t.Fatalf("expected conflict warning text, got:\n%s", out.Stdout)
		}
	})

	t.Run("agent mode reports WARN line", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := runCommand("-c", cfgPath, "tool", "validate")
		if err != nil {
			t.Fatalf("unexpected error on validate with warnings: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, `WARN: [tools/flutter.tool.ts] flutter: alias "fd" ('flutter doctor') shadows binary "fd" from tools/fd.tool.ts`) {
			t.Fatalf("expected WARN line in agent mode, got:\n%s", out.Stdout)
		}
	})
}
