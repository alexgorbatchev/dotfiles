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
