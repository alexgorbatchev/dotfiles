package e2e

import (
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func init() {
	// Set TMPDIR to .tmp in the project root to satisfy local sandbox guidelines
	// and ensure Bun can resolve node_modules up the directory tree from the temp dir.
	dir, err := os.Getwd()
	if err == nil {
		for dir != "/" && dir != "." {
			if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
				tmpDir := filepath.Join(dir, ".tmp")
				_ = os.MkdirAll(tmpDir, 0755)
				_ = os.Setenv("TMPDIR", tmpDir)
				break
			}
			dir = filepath.Dir(dir)
		}
	}
}

type TestHarness struct {
	T             *testing.T
	TempDir       string
	BinPath       string
	ConfigPath    string
	MockServerURL string
	Env           map[string]string
	ProjectRoot   string
}

type HarnessOptions struct {
	ConfigPath    string
	ConfigContent string
	Env           map[string]string
}

func NewTestHarness(t *testing.T, options HarnessOptions) *TestHarness {
	t.Helper()
	tempDir := t.TempDir()

	h := &TestHarness{
		T:          t,
		TempDir:    tempDir,
		ConfigPath: options.ConfigPath,
		Env:        options.Env,
	}
	h.ProjectRoot = h.findProjectRoot()

	if h.ConfigPath == "" || h.ConfigPath == "dotfiles.config.ts" || h.ConfigPath == "config.ts" {
		h.ConfigPath = "config.json"
	}
	if !filepath.IsAbs(h.ConfigPath) {
		h.ConfigPath = filepath.Join(tempDir, h.ConfigPath)
	}

	// Write config content if provided
	if options.ConfigContent != "" {
		fullConfigPath := filepath.Join(tempDir, h.ConfigPath)
		// Ensure parent directory of the config exists
		err := os.MkdirAll(filepath.Dir(fullConfigPath), 0755)
		if err != nil {
			t.Fatalf("failed to create config parent directory: %v", err)
		}
		err = os.WriteFile(fullConfigPath, []byte(options.ConfigContent), 0644)
		if err != nil {
			t.Fatalf("failed to write config content: %v", err)
		}
	}

	// Dynamic compiled binary discovery
	projectRoot := h.findProjectRoot()
	binPath := filepath.Join(projectRoot, ".dist", "dotfiles")
	if _, err := os.Stat(binPath); err != nil {
		// Dynamically compile under TempDir()
		binPath = filepath.Join(tempDir, "dotfiles")
		cmd := exec.Command("go", "build", "-o", binPath, filepath.Join(projectRoot, "cmd", "dotfiles"))
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("failed to dynamically compile dotfiles: %v\noutput: %s", err, string(output))
		}
	}
	h.BinPath = binPath

	// Ensure HOME and XDG_CONFIG_HOME directories are created inside sandbox
	sandboxHome := filepath.Join(tempDir, "home")
	sandboxConfig := filepath.Join(tempDir, "home", ".config")
	err := os.MkdirAll(sandboxHome, 0755)
	if err != nil {
		t.Fatalf("failed to create sandbox home directory: %v", err)
	}
	err = os.MkdirAll(sandboxConfig, 0755)
	if err != nil {
		t.Fatalf("failed to create sandbox config directory: %v", err)
	}

	return h
}

// Command execution wrappers
func (h *TestHarness) RunCommand(args ...string) (stdout, stderr string, exitCode int, err error) {
	cmd := exec.Command(h.BinPath, args...)
	cmd.Dir = h.TempDir

	// Build environment variables map, starting with existing environment
	envMap := make(map[string]string)
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}

	// Override specific variables to target sandbox to prevent global mutation
	sandboxHome := filepath.Join(h.TempDir, "home")
	sandboxConfig := filepath.Join(h.TempDir, "home", ".config")
	envMap["HOME"] = sandboxHome
	envMap["XDG_CONFIG_HOME"] = sandboxConfig
	envMap["NO_COLOR"] = "1"
	envMap["TERM"] = "dumb"
	envMap["DOTFILES_REPO_ROOT"] = h.ProjectRoot
	envMap["DOTFILES_E2E_TEST"] = "true"

	// Setup mock server port environment variable if server URL is provided
	if h.MockServerURL != "" {
		parts := strings.Split(h.MockServerURL, ":")
		if len(parts) > 2 {
			port := parts[len(parts)-1]
			envMap["MOCK_SERVER_PORT"] = port
		}
	}

	// Merge with extra env vars provided at initialization
	for k, v := range h.Env {
		envMap[k] = v
	}

	// Convert map back to slice format for exec.Cmd
	var env []string
	for k, v := range envMap {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err = cmd.Run()
	stdout = outBuf.String()
	stderr = errBuf.String()

	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
			err = nil // Do not return exit code error as a Go error
		} else {
			exitCode = -1
		}
	} else {
		exitCode = 0
	}

	return stdout, stderr, exitCode, err
}

func (h *TestHarness) Generate(args ...string) (stdout, stderr string, exitCode int, err error) {
	allArgs := append([]string{"generate", "--config", h.ConfigPath}, args...)
	return h.RunCommand(allArgs...)
}

func (h *TestHarness) Install(tools []string, args ...string) (stdout, stderr string, exitCode int, err error) {
	allArgs := []string{"install", "--config", h.ConfigPath}
	allArgs = append(allArgs, tools...)
	allArgs = append(allArgs, args...)
	return h.RunCommand(allArgs...)
}

func (h *TestHarness) Update(toolName string, args ...string) (stdout, stderr string, exitCode int, err error) {
	allArgs := []string{"update", "--config", h.ConfigPath, toolName}
	allArgs = append(allArgs, args...)
	return h.RunCommand(allArgs...)
}

// Assertions on filesystem and files
func (h *TestHarness) AssertFileExists(path string) {
	h.T.Helper()
	fullPath := path
	if !filepath.IsAbs(path) {
		fullPath = filepath.Join(h.TempDir, path)
	}
	if _, err := os.Stat(fullPath); err != nil {
		h.T.Fatalf("expected file to exist: %s, error: %v", fullPath, err)
	}
}

func (h *TestHarness) AssertFileContentContains(path string, expected string) {
	h.T.Helper()
	fullPath := path
	if !filepath.IsAbs(path) {
		fullPath = filepath.Join(h.TempDir, path)
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		h.T.Fatalf("failed to read file: %s, error: %v", fullPath, err)
	}
	if !strings.Contains(string(content), expected) {
		h.T.Fatalf("expected file %s to contain %q, but got:\n%s", fullPath, expected, string(content))
	}
}

func (h *TestHarness) AssertShimExistsAndExecutable(shimName string) {
	h.T.Helper()
	shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", shimName)
	info, err := os.Stat(shimPath)
	if err != nil {
		h.T.Fatalf("expected shim to exist: %s, error: %v", shimPath, err)
	}
	if info.Mode()&0111 == 0 {
		h.T.Fatalf("expected shim to be executable: %s, mode: %v", shimPath, info.Mode())
	}
}

func (h *TestHarness) AssertShellInitContains(shellType string, expected string) {
	h.T.Helper()
	ext := shellType
	if shellType == "powershell" {
		ext = "ps1"
	}
	scriptPath := filepath.Join(h.TempDir, ".generated", "shell-scripts", "main."+ext)
	content, err := os.ReadFile(scriptPath)
	if err != nil {
		h.T.Fatalf("failed to read shell init script: %s, error: %v", scriptPath, err)
	}
	if !strings.Contains(string(content), expected) {
		h.T.Fatalf("expected shell init %s to contain %q, but got:\n%s", scriptPath, expected, string(content))
	}
}

func (h *TestHarness) AssertEnvironmentVariable(toolName, varName, expectedValue string) {
	h.T.Helper()
	scriptPath := filepath.Join(h.TempDir, ".generated", "shell-scripts", "main.zsh")
	content, err := os.ReadFile(scriptPath)
	if err != nil {
		h.T.Fatalf("failed to read shell script: %s, error: %v", scriptPath, err)
	}
	pattern1 := fmt.Sprintf("export %s=%q", varName, expectedValue)
	pattern2 := fmt.Sprintf("export %s='%s'", varName, expectedValue)
	if !strings.Contains(string(content), pattern1) && !strings.Contains(string(content), pattern2) {
		h.T.Fatalf("expected env var %s to be exported with value %q in %s", varName, expectedValue, scriptPath)
	}
}

func (h *TestHarness) AssertAlias(toolName, aliasName, expectedCommand string) {
	h.T.Helper()
	scriptPath := filepath.Join(h.TempDir, ".generated", "shell-scripts", "main.zsh")
	content, err := os.ReadFile(scriptPath)
	if err != nil {
		h.T.Fatalf("failed to read shell script: %s, error: %v", scriptPath, err)
	}
	pattern1 := fmt.Sprintf("alias %s='%s'", aliasName, expectedCommand)
	pattern2 := fmt.Sprintf("alias %s=%q", aliasName, expectedCommand)
	if !strings.Contains(string(content), pattern1) && !strings.Contains(string(content), pattern2) {
		h.T.Fatalf("expected alias %s to map to %q in %s", aliasName, expectedCommand, scriptPath)
	}
}

func (h *TestHarness) AssertOnceScriptContains(toolName, content string) {
	h.T.Helper()
	onceDir := filepath.Join(h.TempDir, ".generated", "shell-scripts", ".once")
	files, err := os.ReadDir(onceDir)
	if err != nil {
		h.T.Fatalf("failed to read once directory: %s, error: %v", onceDir, err)
	}
	found := false
	for _, file := range files {
		if strings.HasPrefix(file.Name(), "once-") && strings.HasSuffix(file.Name(), ".zsh") {
			b, err := os.ReadFile(filepath.Join(onceDir, file.Name()))
			if err == nil && strings.Contains(string(b), content) {
				found = true
				break
			}
		}
	}
	if !found {
		h.T.Fatalf("expected to find a once script containing %q for tool %s", content, toolName)
	}
}

func (h *TestHarness) AssertAlwaysScriptContains(toolName, content string) {
	h.T.Helper()
	scriptPath := filepath.Join(h.TempDir, ".generated", "shell-scripts", "main.zsh")
	b, err := os.ReadFile(scriptPath)
	if err != nil {
		h.T.Fatalf("failed to read shell script: %s, error: %v", scriptPath, err)
	}
	if !strings.Contains(string(b), content) {
		h.T.Fatalf("expected always script to contain %q in %s", content, scriptPath)
	}
}

// Assertions on the persisted SQLite database state
func (h *TestHarness) AssertDBOperationLogged(toolName, opType, filePath string) {
	h.T.Helper()
	dbPath := filepath.Join(h.TempDir, ".generated", "registry.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		h.T.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM file_operations WHERE tool_name = ? AND operation_type = ? AND file_path LIKE ?", toolName, opType, "%"+filePath).Scan(&count)
	if err != nil {
		h.T.Fatalf("database query failed: %v", err)
	}
	if count == 0 {
		h.T.Fatalf("expected DB to have logged operation for tool %q, type %q, file %q", toolName, opType, filePath)
	}
}

func (h *TestHarness) AssertDBToolInstalled(toolName, version string) {
	h.T.Helper()
	dbPath := filepath.Join(h.TempDir, ".generated", "registry.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		h.T.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	var dbVersion string
	err = db.QueryRow("SELECT version FROM tool_installations WHERE tool_name = ?", toolName).Scan(&dbVersion)
	if err != nil {
		if err == sql.ErrNoRows {
			h.T.Fatalf("expected tool %q to be installed in DB, but found no record", toolName)
		}
		h.T.Fatalf("database query failed: %v", err)
	}
	if dbVersion != version {
		h.T.Fatalf("expected installed tool %q to have version %q, but got %q", toolName, version, dbVersion)
	}
}

// Helper: CopyFixture copies a fixture directory from legacy packages to the sandbox
func (h *TestHarness) CopyFixture(fixtureName string) {
	h.T.Helper()
	projectRoot := h.findProjectRoot()
	srcDir := filepath.Join(projectRoot, "packages", "e2e-test", "src", "__tests__", "fixtures", fixtureName)
	err := h.copyDir(srcDir, h.TempDir)
	if err != nil {
		h.T.Fatalf("failed to copy fixture %q to sandbox: %v", fixtureName, err)
	}

	// Compile the ORIGINAL fixture config.ts to JSON using scripts/load-configs.ts
	originalConfigPath := filepath.Join(srcDir, "config.ts")
	if _, err := os.Stat(originalConfigPath); err == nil {
		cmd := exec.Command("bun", "run", "scripts/load-configs.ts", originalConfigPath)
		cmd.Dir = h.ProjectRoot
		if h.MockServerURL != "" {
			parts := strings.Split(h.MockServerURL, ":")
			if len(parts) > 2 {
				port := parts[len(parts)-1]
				cmd.Env = append(os.Environ(), "MOCK_SERVER_PORT="+port)
			}
		}
		output, err := cmd.CombinedOutput()
		if err != nil {
			h.T.Fatalf("failed to compile original config.ts in test harness: %v\noutput: %s", err, string(output))
		}

		// Replace the original generatedDir path with sandbox generatedDir path in JSON string
		originalGenDir := filepath.ToSlash(filepath.Join(projectRoot, ".tmp", "e2e-test", "worker-default", fixtureName))
		sandboxGenDir := filepath.ToSlash(filepath.Join(h.TempDir, ".generated"))
		
		jsonStr := string(output)
		jsonStr = strings.ReplaceAll(jsonStr, originalGenDir, sandboxGenDir)
		
		// Also replace original config file path and directory
		originalConfigDir := filepath.ToSlash(filepath.Join(projectRoot, "packages", "e2e-test", "src", "__tests__", "fixtures", fixtureName))
		sandboxConfigDir := filepath.ToSlash(h.TempDir)
		jsonStr = strings.ReplaceAll(jsonStr, originalConfigDir, sandboxConfigDir)

		err = os.WriteFile(filepath.Join(h.TempDir, "config.json"), []byte(jsonStr), 0644)
		if err != nil {
			h.T.Fatalf("failed to write compiled config.json: %v", err)
		}

		h.ConfigPath = filepath.Join(h.TempDir, "config.json")
	}
}

func (h *TestHarness) findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		h.T.Fatalf("failed to get current working directory: %v", err)
	}
	for dir != "/" && dir != "." {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	h.T.Fatalf("failed to find project root (containing go.mod)")
	return ""
}

func (h *TestHarness) copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	err = os.MkdirAll(dst, srcInfo.Mode())
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			err = h.copyDir(srcPath, dstPath)
			if err != nil {
				return err
			}
		} else {
			err = h.copyFile(srcPath, dstPath)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *TestHarness) copyFile(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
