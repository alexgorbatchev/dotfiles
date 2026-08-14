package e2e

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestHarnessAssertionsAndMethods(t *testing.T) {
	tmpDir := t.TempDir()

	harness := &TestHarness{
		T:       t,
		TempDir: tmpDir,
	}

	// Create test files for harness assertions
	_ = os.MkdirAll(filepath.Join(tmpDir, ".generated", "user-bin"), 0755)
	_ = os.MkdirAll(filepath.Join(tmpDir, ".generated", "shell-scripts", ".once"), 0755)

	// Shim file
	shimPath := filepath.Join(tmpDir, ".generated", "user-bin", "rg")
	_ = os.WriteFile(shimPath, []byte("#!/bin/bash\n"), 0755)

	// File content
	filePath := filepath.Join(tmpDir, "config.txt")
	_ = os.WriteFile(filePath, []byte("hello world config"), 0644)

	// Shell init main.zsh & main.ps1
	mainZsh := filepath.Join(tmpDir, ".generated", "shell-scripts", "main.zsh")
	zshContent := "export MY_VAR=\"my_val\"\nalias myalias=\"mycmd\"\necho always_script\n"
	_ = os.WriteFile(mainZsh, []byte(zshContent), 0644)

	mainPs1 := filepath.Join(tmpDir, ".generated", "shell-scripts", "main.ps1")
	_ = os.WriteFile(mainPs1, []byte("powershell content"), 0644)

	// Once script
	onceScript := filepath.Join(tmpDir, ".generated", "shell-scripts", ".once", "once-001.zsh")
	_ = os.WriteFile(onceScript, []byte("echo once_content"), 0644)

	// SQLite DB for DB assertions
	dbPath := filepath.Join(tmpDir, ".generated", "registry.db")
	database, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}

	_, _ = database.Exec(`
		CREATE TABLE file_operations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tool_name TEXT NOT NULL,
			operation_type TEXT NOT NULL,
			file_path TEXT NOT NULL,
			target_path TEXT,
			file_type TEXT NOT NULL,
			metadata TEXT,
			size_bytes INTEGER,
			permissions TEXT,
			created_at INTEGER NOT NULL,
			operation_id TEXT NOT NULL
		);
		CREATE TABLE tool_installations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tool_name TEXT NOT NULL UNIQUE,
			version TEXT NOT NULL,
			install_path TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			installed_at INTEGER NOT NULL,
			binary_paths TEXT NOT NULL
		);
		INSERT INTO file_operations (tool_name, operation_type, file_path, file_type, created_at, operation_id)
		VALUES ('ripgrep', 'write', '/home/user/rg.txt', 'file', 1000, 'op1');
		INSERT INTO tool_installations (tool_name, version, install_path, timestamp, installed_at, binary_paths)
		VALUES ('ripgrep', '14.1.0', '/opt/rg', 'now', 1000, '[]');
	`)
	database.Close()

	// Run assertions
	harness.AssertFileExists("config.txt")
	harness.AssertFileContentContains("config.txt", "hello world")
	harness.AssertShimExistsAndExecutable("rg")
	harness.AssertShellInitContains("zsh", "export MY_VAR")
	harness.AssertShellInitContains("powershell", "powershell content")
	harness.AssertEnvironmentVariable("ripgrep", "MY_VAR", "my_val")
	harness.AssertAlias("ripgrep", "myalias", "mycmd")
	harness.AssertOnceScriptContains("ripgrep", "once_content")
	harness.AssertAlwaysScriptContains("ripgrep", "always_script")
	harness.AssertDBOperationLogged("ripgrep", "write", "rg.txt")
	harness.AssertDBToolInstalled("ripgrep", "14.1.0")
}

func TestMockServerCargoAndDownloadEndpoints(t *testing.T) {
	harness := &TestHarness{
		T:       t,
		TempDir: t.TempDir(),
	}
	projectRoot := harness.findProjectRoot()
	fixtureDir := filepath.Join(projectRoot, "tests", "e2e", "fixtures", "test-mock-fix")

	_ = os.MkdirAll(filepath.Join(fixtureDir, "tools", "gitea-release-tool"), 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "tools", "gitea-release-tool", "gitea-release-tool-1.0.0-linux_amd64.tar.gz"), []byte("gitea data"), 0644)
	_ = os.WriteFile(filepath.Join(fixtureDir, "tools", "gitea-release-tool", "gitea-release-tool-1.0.0-macos_arm64.tar.gz"), []byte("gitea mac data"), 0644)

	_ = os.MkdirAll(filepath.Join(fixtureDir, "tools", "ripgrep"), 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "tools", "ripgrep", "ripgrep-14.1.0-x86_64.tar.gz"), []byte("github data"), 0644)

	_ = os.MkdirAll(filepath.Join(fixtureDir, "tools", "cargo-quickinstall-tool"), 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "tools", "cargo-quickinstall-tool", "cargo-quickinstall-tool-1.0.0-x86_64-unknown-linux-musl.tar.gz"), []byte("cargo data"), 0644)
	_ = os.WriteFile(filepath.Join(fixtureDir, "tools", "cargo-quickinstall-tool", "cargo-quickinstall-tool-1.0.0-aarch64-apple-darwin.tar.gz"), []byte("cargo mac data"), 0644)

	defer os.RemoveAll(fixtureDir)

	ms := NewMockServer(t, "test-mock-fix")
	defer ms.Close()

	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Cargo crate endpoint
	resp, err := client.Get(ms.Server.URL + "/api/v1/crates/cargo-quickinstall-tool")
	if err != nil {
		t.Fatalf("cargo crate request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK for cargo crate, got %d", resp.StatusCode)
	}

	// 2. Cargo quickinstall endpoint
	resp2, err := client.Get(ms.Server.URL + "/cargo-bins/cargo-quickinstall/releases/download/v1/cargo-quickinstall-tool-1.0.0-x86_64.tar.gz")
	if err != nil {
		t.Fatalf("cargo quickinstall request failed: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK for quickinstall, got %d", resp2.StatusCode)
	}

	// 3. GitHub download asset endpoint
	resp3, err := client.Get(ms.Server.URL + "/BurntSushi/ripgrep/releases/download/v14.1.0/ripgrep-14.1.0-x86_64.tar.gz")
	if err != nil {
		t.Fatalf("github download request failed: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK for github download, got %d", resp3.StatusCode)
	}

	// 3b. GitHub download fallback via filepath.Walk
	_ = os.WriteFile(filepath.Join(fixtureDir, "walked_asset.tar.gz"), []byte("walked data"), 0644)
	respWalk, err := client.Get(ms.Server.URL + "/owner/repo/releases/download/v1.0.0/walked_asset.tar.gz")
	if err != nil || respWalk.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK for walked asset download")
	}
	if respWalk != nil {
		respWalk.Body.Close()
	}

	// 3c. GitHub download 404 error
	resp404, err := client.Get(ms.Server.URL + "/owner/repo/releases/download/v1.0.0/missing.tar.gz")
	if err != nil || resp404.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for missing asset download")
	}
	if resp404 != nil {
		resp404.Body.Close()
	}

	// 4. Gitea attachment endpoint
	resp4, err := client.Get(ms.Server.URL + "/attachments/gitea-release-tool-1.0.0-2")
	if err != nil {
		t.Fatalf("gitea attachment request failed: %v", err)
	}
	defer resp4.Body.Close()
	if resp4.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK for gitea attachment, got %d", resp4.StatusCode)
	}

	// 5. Cargo quickinstall darwin endpoint
	resp5, err := client.Get(ms.Server.URL + "/cargo-bins/cargo-quickinstall/releases/download/v1/cargo-quickinstall-tool-1.0.0-aarch64-apple-darwin.tar.gz")
	if err != nil || resp5.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for darwin quickinstall")
	}
	if resp5 != nil {
		resp5.Body.Close()
	}

	// 6. Gitea attachment macos endpoint
	resp6, err := client.Get(ms.Server.URL + "/attachments/gitea-release-tool-1.0.0-1")
	if err != nil || resp6.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for macos gitea attachment")
	}
	if resp6 != nil {
		resp6.Body.Close()
	}

	// 7. Gitea release tag endpoint and SetToolVersion
	respSet, err := client.Get(ms.Server.URL + "/set-tool-version/myorg/myrepo/v2.0.0")
	if err == nil && respSet.StatusCode == http.StatusOK {
		respSet.Body.Close()
	}

	respTag, err := client.Get(ms.Server.URL + "/api/v1/repos/myorg/myrepo/releases/tags/v2.0.0")
	if err == nil && respTag.StatusCode == http.StatusOK {
		respTag.Body.Close()
	}

	// 8. Unknown crate 404
	respCargo404, err := client.Get(ms.Server.URL + "/api/v1/crates/unknown-crate")
	if err == nil && respCargo404.StatusCode == http.StatusNotFound {
		respCargo404.Body.Close()
	}
}

func TestCopyFixture(t *testing.T) {
	tmpDir := t.TempDir()
	harness := &TestHarness{
		T:       t,
		TempDir: tmpDir,
	}

	// Create test fixture under tests/e2e/fixtures
	projectRoot := harness.findProjectRoot()
	fixtureDir := filepath.Join(projectRoot, "tests", "e2e", "fixtures", "test-harness-fix")
	_ = os.MkdirAll(fixtureDir, 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "dotfiles.config.ts"), []byte("config"), 0644)
	defer os.RemoveAll(fixtureDir)

	harness.CopyFixture("test-harness-fix")

	data, err := os.ReadFile(filepath.Join(tmpDir, "dotfiles.config.ts"))
	if err != nil || len(data) == 0 {
		t.Errorf("CopyFixture failed: %v, len=%d", err, len(data))
	}
}

func TestCopyFixtureWithConfigJson(t *testing.T) {
	tmpDir := t.TempDir()
	harness := &TestHarness{
		T:       t,
		TempDir: tmpDir,
	}

	projectRoot := harness.findProjectRoot()
	fixtureDir := filepath.Join(projectRoot, "tests", "e2e", "fixtures", "test-cfgjson-fix")
	_ = os.MkdirAll(fixtureDir, 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "dotfiles.config.ts"), []byte("config"), 0644)
	_ = os.WriteFile(filepath.Join(fixtureDir, "config.json"), []byte(`{"paths":{"generatedDir":"/tmp/e2e-test/worker-default/test-cfgjson-fix"}}`), 0644)
	defer os.RemoveAll(fixtureDir)

	harness.CopyFixture("test-cfgjson-fix")

	data, err := os.ReadFile(filepath.Join(tmpDir, "config.json"))
	if err != nil || len(data) == 0 {
		t.Errorf("CopyFixture with config.json failed: %v, len=%d", err, len(data))
	}
}

func TestNewTestHarnessConfigContentAndEnv(t *testing.T) {
	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: `export default { paths: { generatedDir: "./.generated" } };`,
		Env: map[string]string{
			"TEST_HARNESS_VAR": "val",
		},
	})
	if h.ConfigPath == "" {
		t.Errorf("expected non-empty ConfigPath")
	}
	content, err := os.ReadFile(h.ConfigPath)
	if err != nil || !strings.Contains(string(content), "generatedDir") {
		t.Errorf("expected ConfigContent written to ConfigPath")
	}
}

func TestTestHarnessCommands(t *testing.T) {
	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: `export default { paths: { generatedDir: "./.generated" } };`,
	})

	_, _, _, _ = h.Generate()
	_, _, _, _ = h.Install([]string{"test-tool"})
	_, _, _, _ = h.Update("test-tool")
}

func TestHarnessDBAssertions(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, ".generated", "registry.db")
	_ = os.MkdirAll(filepath.Dir(dbPath), 0755)

	database, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	_, _ = database.Exec(`
		CREATE TABLE file_operations (tool_name TEXT, operation_type TEXT, file_path TEXT);
		CREATE TABLE tool_installations (tool_name TEXT, version TEXT);
		INSERT INTO file_operations VALUES ('mytool', 'write', '/home/user/file.txt');
		INSERT INTO tool_installations VALUES ('mytool', '1.0.0');
	`)
	database.Close()

	h := &TestHarness{T: t, TempDir: tmpDir}

	h.AssertDBToolInstalled("mytool", "1.0.0")
	h.AssertDBOperationLogged("mytool", "write", "file.txt")
}

func TestCopyDirAndFileErrors(t *testing.T) {
	tmpDir := t.TempDir()
	harness := &TestHarness{
		T:       t,
		TempDir: tmpDir,
	}

	// 1. copyDir error
	err := harness.copyDir(filepath.Join(tmpDir, "nonexistent"), filepath.Join(tmpDir, "dst"))
	if err == nil {
		t.Error("expected error copying non-existent directory")
	}

	// 2. copyFile error
	err = harness.copyFile(filepath.Join(tmpDir, "nonexistent.txt"), filepath.Join(tmpDir, "dst.txt"))
	if err == nil {
		t.Error("expected error copying non-existent file")
	}

	// 3. cleanTestTmp
	cleanTestTmp()
}

func TestNewMockServerDirect(t *testing.T) {
	h := &TestHarness{T: t, TempDir: t.TempDir()}
	projectRoot := h.findProjectRoot()
	fixtureDir := filepath.Join(projectRoot, "tests", "e2e", "fixtures", "test-mock-fix-2")
	_ = os.MkdirAll(fixtureDir, 0755)
	_ = os.WriteFile(filepath.Join(fixtureDir, "dotfiles.config.ts"), []byte("config"), 0644)
	defer os.RemoveAll(fixtureDir)

	ms := NewMockServer(t, "test-mock-fix-2")
	if ms == nil || ms.Server == nil {
		t.Fatal("expected non-nil MockServer")
	}
	ms.Close()
}
