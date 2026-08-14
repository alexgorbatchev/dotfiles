package vm

import (
	"os"
	"runtime"
	"testing"
)

type TestConfig struct {
	Name    string `json:"name"`
	Value   int    `json:"value"`
	Enabled bool   `json:"enabled"`
}

type TestPlatformConfig struct {
	OS         string `json:"os"`
	Arch       string `json:"arch"`
	IsMac      bool   `json:"isMac"`
	IsLinux    bool   `json:"isLinux"`
	IsWindows  bool   `json:"isWindows"`
	Libc       string `json:"libc"`
	TestEnv    string `json:"testEnv"`
	FileExists bool   `json:"fileExists"`
}

func TestEvaluateToolDefinition(t *testing.T) {
	tests := []struct {
		name      string
		script    string
		expectErr bool
		expected  TestConfig
	}{
		{
			name:   "defineConfig style",
			script: `defineConfig({ name: "foo", value: 42, enabled: true });`,
			expected: TestConfig{
				Name:    "foo",
				Value:   42,
				Enabled: true,
			},
		},
		{
			name: "multi-line imports style",
			script: `import {
  defineConfig,
  defineTool
} from "@alexgorbatchev/dotfiles";
import type { Config } from "./types";

defineConfig({ name: "multiline", value: 500, enabled: true });`,
			expected: TestConfig{
				Name:    "multiline",
				Value:   500,
				Enabled: true,
			},
		},
		{
			name:   "defineTool style",
			script: `defineTool({ name: "bar", value: 100, enabled: false });`,
			expected: TestConfig{
				Name:    "bar",
				Value:   100,
				Enabled: false,
			},
		},
		{
			name:   "CJS module.exports style",
			script: `module.exports = { name: "cjs", value: 200, enabled: true };`,
			expected: TestConfig{
				Name:    "cjs",
				Value:   200,
				Enabled: true,
			},
		},
		{
			name:   "CJS exports.default style",
			script: `exports.default = { name: "cjs-default", value: 300, enabled: false };`,
			expected: TestConfig{
				Name:    "cjs-default",
				Value:   300,
				Enabled: false,
			},
		},
		{
			name:   "raw expression style",
			script: `({ name: "raw", value: 99, enabled: true });`,
			expected: TestConfig{
				Name:    "raw",
				Value:   99,
				Enabled: true,
			},
		},
		{
			name:      "syntax error",
			script:    `const a = ;`,
			expectErr: true,
		},
		{
			name:      "invalid return structure type matching",
			script:    `({ name: 123, value: "not-an-int" });`,
			expectErr: true,
		},
		{
			name:      "no export or capture",
			script:    `const empty = 1;`,
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var cfg TestConfig
			err := EvaluateToolDefinition(tt.script, &cfg)

			if (err != nil) != tt.expectErr {
				t.Fatalf("EvaluateToolDefinition() error = %v, expectErr = %v", err, tt.expectErr)
			}

			if !tt.expectErr {
				if cfg.Name != tt.expected.Name {
					t.Errorf("expected Name %q, got %q", tt.expected.Name, cfg.Name)
				}
				if cfg.Value != tt.expected.Value {
					t.Errorf("expected Value %d, got %d", tt.expected.Value, cfg.Value)
				}
				if cfg.Enabled != tt.expected.Enabled {
					t.Errorf("expected Enabled %v, got %v", tt.expected.Enabled, cfg.Enabled)
				}
			}
		})
	}
}

func TestEvaluateToolDefinition_CJSPrimitive(t *testing.T) {
	var s string
	err := EvaluateToolDefinition(`module.exports = "hello-primitive";`, &s)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s != "hello-primitive" {
		t.Errorf("expected 'hello-primitive', got %q", s)
	}
}

func TestBindings(t *testing.T) {
	// Set environment variable for test
	err := os.Setenv("TEST_DOTFILES_VM", "hello-from-env")
	if err != nil {
		t.Fatalf("failed to set env var: %v", err)
	}
	defer os.Unsetenv("TEST_DOTFILES_VM")

	// Get a valid existing file on the current filesystem
	tempFile, err := os.CreateTemp("", "test-vm-binding")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tempFile.Name())
	tempFile.Close()

	script := `
		defineConfig({
			os: getOS(),
			arch: getArch(),
			isMac: isMac(),
			isLinux: isLinux(),
			isWindows: isWindows(),
			libc: detectLibc(),
			testEnv: getenv("TEST_DOTFILES_VM"),
			fileExists: fileExists("` + tempFile.Name() + `")
		});
	`

	var cfg TestPlatformConfig
	err = EvaluateToolDefinition(script, &cfg)
	if err != nil {
		t.Fatalf("failed to evaluate script: %v", err)
	}

	// Verify the bindings output match expected system parameters
	expectedOS := "unknown"
	if runtime.GOOS == "darwin" {
		expectedOS = "darwin"
	} else if runtime.GOOS == "linux" {
		expectedOS = "linux"
	}

	if cfg.OS != expectedOS {
		t.Errorf("getOS() returned %q, expected %q", cfg.OS, expectedOS)
	}

	expectedArch := "unknown"
	if runtime.GOARCH == "amd64" {
		expectedArch = "amd64"
	} else if runtime.GOARCH == "arm64" {
		expectedArch = "arm64"
	}

	if cfg.Arch != expectedArch {
		t.Errorf("getArch() returned %q, expected %q", cfg.Arch, expectedArch)
	}

	if cfg.IsMac != (runtime.GOOS == "darwin") {
		t.Errorf("isMac() returned %v, expected %v", cfg.IsMac, runtime.GOOS == "darwin")
	}

	if cfg.IsLinux != (runtime.GOOS == "linux") {
		t.Errorf("isLinux() returned %v, expected %v", cfg.IsLinux, runtime.GOOS == "linux")
	}

	if cfg.IsWindows != (runtime.GOOS == "windows") {
		t.Errorf("isWindows() returned %v, expected %v", cfg.IsWindows, runtime.GOOS == "windows")
	}

	if cfg.TestEnv != "hello-from-env" {
		t.Errorf("getenv() returned %q, expected %q", cfg.TestEnv, "hello-from-env")
	}

	if !cfg.FileExists {
		t.Errorf("fileExists() returned false for %s, expected true", tempFile.Name())
	}

	// Test with non-existent file
	scriptNonExistent := `
		defineConfig({
			fileExists: fileExists("/nonexistent/file/path/here/1234")
		});
	`
	var cfgNonExistent TestPlatformConfig
	err = EvaluateToolDefinition(scriptNonExistent, &cfgNonExistent)
	if err != nil {
		t.Fatalf("failed to evaluate script: %v", err)
	}
	if cfgNonExistent.FileExists {
		t.Errorf("fileExists() returned true for nonexistent file, expected false")
	}
}

func TestEvaluateToolDefinitionWithContext(t *testing.T) {
	sysCtx := &SystemContext{
		OS:   "linux",
		Arch: "amd64",
	}
	script := `
		defineConfig({
			name: "ctx-tool",
			value: 42,
			enabled: systemInfo.OS === "linux"
		});
	`
	var cfg TestConfig
	err := EvaluateToolDefinitionWithContext(script, "/home/user/config-dir", sysCtx, &cfg)
	if err != nil {
		t.Fatalf("EvaluateToolDefinitionWithContext failed: %v", err)
	}
	if cfg.Name != "ctx-tool" || cfg.Value != 42 || !cfg.Enabled {
		t.Errorf("unexpected output: %+v", cfg)
	}
}

func TestEvaluateToolDefinitionWithContextStyles(t *testing.T) {
	sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}

	tests := []struct {
		name      string
		script    string
		expectErr bool
		expected  TestConfig
	}{
		{
			name:   "defineTool style",
			script: `defineTool({ name: "tool-ctx", value: 10, enabled: true });`,
			expected: TestConfig{
				Name:    "tool-ctx",
				Value:   10,
				Enabled: true,
			},
		},
		{
			name:   "CJS module.exports style",
			script: `module.exports = { name: "cjs-ctx", value: 20, enabled: false };`,
			expected: TestConfig{
				Name:    "cjs-ctx",
				Value:   20,
				Enabled: false,
			},
		},
		{
			name:   "CJS exports.default style",
			script: `exports.default = { name: "default-ctx", value: 30, enabled: true };`,
			expected: TestConfig{
				Name:    "default-ctx",
				Value:   30,
				Enabled: true,
			},
		},
		{
			name:   "Raw expression style",
			script: `({ name: "raw-ctx", value: 40, enabled: true });`,
			expected: TestConfig{
				Name:    "raw-ctx",
				Value:   40,
				Enabled: true,
			},
		},
		{
			name:      "Syntax error in script",
			script:    `const a = ;`,
			expectErr: true,
		},
		{
			name:      "No config extracted",
			script:    `const unused = 123;`,
			expectErr: true,
		},
		{
			name:      "Type mismatch unmarshal error",
			script:    `({ name: 123, value: "not-an-int" });`,
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var cfg TestConfig
			err := EvaluateToolDefinitionWithContext(tt.script, "/config/dir", sysCtx, &cfg)

			if (err != nil) != tt.expectErr {
				t.Fatalf("EvaluateToolDefinitionWithContext() error = %v, expectErr = %v", err, tt.expectErr)
			}

			if !tt.expectErr {
				if cfg.Name != tt.expected.Name {
					t.Errorf("expected Name %q, got %q", tt.expected.Name, cfg.Name)
				}
				if cfg.Value != tt.expected.Value {
					t.Errorf("expected Value %d, got %d", tt.expected.Value, cfg.Value)
				}
				if cfg.Enabled != tt.expected.Enabled {
					t.Errorf("expected Enabled %v, got %v", tt.expected.Enabled, cfg.Enabled)
				}
			}
		})
	}
}

func TestEvaluateToolDefinitionUndefinedStringify(t *testing.T) {
	script := `(function fn() {})`
	var out map[string]interface{}
	_ = EvaluateToolDefinition(script, &out)

	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	_ = EvaluateToolDefinitionWithContext(script, "/cfg", sysCtx, &out)
}

func TestEvaluateToolDefinitionCJSWithoutDefault(t *testing.T) {
	script := `module.exports = { name: "nodef", value: 77, enabled: true };`
	var cfg TestConfig
	err := EvaluateToolDefinition(script, &cfg)
	if err != nil || cfg.Name != "nodef" {
		t.Errorf("EvaluateToolDefinition CJS without default failed: %v, %+v", err, cfg)
	}

	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	var cfg2 TestConfig
	err = EvaluateToolDefinitionWithContext(script, "/cfg", sysCtx, &cfg2)
	if err != nil || cfg2.Name != "nodef" {
		t.Errorf("EvaluateToolDefinitionWithContext CJS without default failed: %v, %+v", err, cfg2)
	}
}

func TestEvaluateToolDefinitionRawExprFallback(t *testing.T) {
	script := `({ name: "raw-expr", value: 88, enabled: true })`
	var cfg TestConfig
	err := EvaluateToolDefinition(script, &cfg)
	if err != nil || cfg.Name != "raw-expr" {
		t.Errorf("EvaluateToolDefinition raw expr failed: %v, %+v", err, cfg)
	}

	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	var cfg2 TestConfig
	err = EvaluateToolDefinitionWithContext(script, "/cfg", sysCtx, &cfg2)
	if err != nil || cfg2.Name != "raw-expr" {
		t.Errorf("EvaluateToolDefinitionWithContext raw expr failed: %v, %+v", err, cfg2)
	}
}

func TestEvaluateToolDefinitionZeroArgsCapture(t *testing.T) {
	script := `defineConfig();`
	var cfg TestConfig
	err := EvaluateToolDefinition(script, &cfg)
	if err == nil {
		t.Error("expected error when defineConfig is called with 0 args")
	}

	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	err = EvaluateToolDefinitionWithContext(script, "/cfg", sysCtx, &cfg)
	if err == nil {
		t.Error("expected error when defineConfig is called with 0 args in context")
	}
}
