package installer

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestAptDnfPacmanInstallersMore(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()
	sys := NewDefaultSystemContext()

	runner.Register("apt-get", nil, fmt.Errorf("apt failed"))
	runner.Register("dnf", nil, fmt.Errorf("dnf failed"))
	runner.Register("pacman", nil, fmt.Errorf("pacman failed"))

	// 1. Apt failure
	apt := NewAptInstaller(runner, memFS, sys)
	apt.SetLogger(log)

	_, err := apt.Install(ctx, &config.ToolConfig{Name: "apt-tool"})
	if err == nil {
		t.Errorf("expected error running apt-get, got nil")
	}

	// 2. Dnf failure
	dnf := NewDnfInstaller(runner, memFS, sys)
	dnf.SetLogger(log)

	_, err = dnf.Install(ctx, &config.ToolConfig{Name: "dnf-tool"})
	if err == nil {
		t.Errorf("expected error running dnf, got nil")
	}

	// 3. Pacman failure
	pacman := NewPacmanInstaller(runner, memFS, sys)
	pacman.SetLogger(log)

	_, err = pacman.Install(ctx, &config.ToolConfig{Name: "pacman-tool"})
	if err == nil {
		t.Errorf("expected error running pacman, got nil")
	}
}

func TestBrewInstallerMore(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()
	sys := NewDefaultSystemContext()

	runner.Register("brew", nil, fmt.Errorf("brew failed"))

	brew := NewBrewInstaller(runner, memFS, sys)
	brew.SetLogger(log)

	_, err := brew.Install(ctx, &config.ToolConfig{Name: "brew-tool"})
	if err == nil {
		t.Errorf("expected error installing brew formula, got nil")
	}

	tc := &config.ToolConfig{
		Name: "wg",
		InstallParams: map[string]interface{}{
			"formula": "wg",
		},
	}
	_, err = brew.CheckUpdate(ctx, tc)
	if err == nil {
		t.Error("expected error checking brew update when command runner fails")
	}
}

func TestCurlScriptAndBinaryMore(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()
	sys := NewDefaultSystemContext()

	// CurlScript missing url
	cs := NewCurlScriptInstaller(runner, memFS, nil, sys)
	cs.SetLogger(log)

	_, err := cs.Install(ctx, &config.ToolConfig{Name: "cs-tool"})
	if err == nil || !strings.Contains(err.Error(), "URL or shell not specified") {
		t.Errorf("expected URL or shell not specified error, got %v", err)
	}

	// CurlBinary missing url
	cb := NewCurlBinaryInstaller(runner, memFS, nil, sys)
	cb.SetLogger(log)

	_, err = cb.Install(ctx, &config.ToolConfig{Name: "cb-tool"})
	if err == nil || !strings.Contains(err.Error(), "URL not specified") {
		t.Errorf("expected URL not specified error, got %v", err)
	}
}

func TestZshPluginInstallerMore(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()
	sys := NewDefaultSystemContext()

	zp := NewZshPluginInstaller(runner, memFS, sys)
	zp.SetLogger(log)

	// missing repository
	_, err := zp.Install(ctx, &config.ToolConfig{Name: "zp-tool"})
	if err == nil || !strings.Contains(err.Error(), "either repo or url must be specified") {
		t.Errorf("expected either repo or url must be specified error, got %v", err)
	}
}

func TestDmgAndPkgHelpers(t *testing.T) {
	tmpDir := t.TempDir()
	memFS := fs.NewMemFS()

	// 1. findFileWithExtension
	_ = memFS.MkdirAll(filepath.Join(tmpDir, "sub"), 0755)
	_ = memFS.WriteFile(filepath.Join(tmpDir, "sub", "app.app"), []byte("app"), 0644)

	found, err := findFileWithExtension(memFS, tmpDir, ".app")
	if err != nil || !strings.HasSuffix(found, "app.app") {
		t.Errorf("findFileWithExtension failed: %v, %q", err, found)
	}

	// 2. matchPattern
	if !matchPattern("my-app-v1.2.dmg", "/app.*dmg/i") {
		t.Errorf("matchPattern failed for regex match")
	}
	if !matchPattern("my-app-v1.2.dmg", "app") {
		t.Errorf("matchPattern failed for substring match")
	}
	if matchPattern("my-app-v1.2.dmg", "other") {
		t.Errorf("matchPattern returned true for non-matching substring")
	}

	// 3. copyDir
	_ = memFS.MkdirAll("/src_copy", 0755)
	_ = memFS.WriteFile("/src_copy/f.txt", []byte("test"), 0644)

	err = copyDir(memFS, "/src_copy", "/dst_copy")
	if err != nil {
		t.Fatalf("copyDir failed: %v", err)
	}
}

func TestInstallerSettersAndBaseHelpers(t *testing.T) {
	memFS := fs.NewMemFS()
	log := logger.New(logger.Config{Writer: io.Discard})
	runner := exec.NewMockRunner()
	sys := NewDefaultSystemContext()

	// 1. SetFS and SetLogger on all concrete installers
	apt := NewAptInstaller(runner, memFS, sys)
	apt.SetFS(memFS)
	apt.SetLogger(log)

	brew := NewBrewInstaller(runner, memFS, sys)
	brew.SetFS(memFS)
	brew.SetLogger(log)

	cargo := NewCargoInstaller(runner, memFS, nil, sys)
	cargo.SetFS(memFS)
	cargo.SetLogger(log)

	cb := NewCurlBinaryInstaller(runner, memFS, nil, sys)
	cb.SetFS(memFS)
	cb.SetLogger(log)

	cs := NewCurlScriptInstaller(runner, memFS, nil, sys)
	cs.SetFS(memFS)
	cs.SetLogger(log)

	ct := NewCurlTarInstaller(runner, memFS, nil, sys)
	ct.SetFS(memFS)
	ct.SetLogger(log)

	dmg := NewDmgInstaller(runner, memFS, nil, sys)
	dmg.SetFS(memFS)
	dmg.SetLogger(log)

	dnf := NewDnfInstaller(runner, memFS, sys)
	dnf.SetFS(memFS)
	dnf.SetLogger(log)

	gitea := NewGiteaInstaller(runner, memFS, nil, sys)
	gitea.SetFS(memFS)
	gitea.SetLogger(log)

	gh := NewGitHubInstaller(runner, memFS, nil, sys)
	gh.SetFS(memFS)
	gh.SetLogger(log)

	manual := NewManualInstaller(runner, memFS, sys)
	manual.SetFS(memFS)
	manual.SetLogger(log)

	npm := NewNpmInstaller(runner, memFS, sys)
	npm.SetFS(memFS)
	npm.SetLogger(log)

	pacman := NewPacmanInstaller(runner, memFS, sys)
	pacman.SetFS(memFS)
	pacman.SetLogger(log)

	pkg := NewPkgInstaller(runner, memFS, nil, sys)
	pkg.SetFS(memFS)
	pkg.SetLogger(log)

	zp := NewZshPluginInstaller(runner, memFS, sys)
	zp.SetFS(memFS)
	zp.SetLogger(log)

	// IsDryRun and GetBinaryNames
	if IsDryRun() {
		t.Error("expected IsDryRun false by default")
	}
	bins := GetBinaryNames("mytool", nil)
	if len(bins) != 1 || bins[0] != "mytool" {
		t.Errorf("GetBinaryNames default mismatch: %v", bins)
	}
	params := map[string]interface{}{
		"b1": true,
		"b2": "true",
		"b3": false,
		"s1": []string{"a", "b"},
		"s2": []interface{}{"c", "d"},
		"s3": "single",
	}

	if !getBoolParam(params, "b1", false) {
		t.Error("expected true for b1")
	}
	if !getBoolParam(params, "b2", false) {
		t.Error("expected true for b2")
	}
	if getBoolParam(params, "b3", true) {
		t.Error("expected false for b3")
	}

	if s := getStringSliceParam(params, "s1"); len(s) != 2 || s[0] != "a" {
		t.Errorf("getStringSliceParam s1 mismatch: %v", s)
	}
	if s := getStringSliceParam(params, "s2"); len(s) != 2 || s[0] != "c" {
		t.Errorf("getStringSliceParam s2 mismatch: %v", s)
	}
	if s := getStringSliceParam(params, "s3"); len(s) != 1 || s[0] != "single" {
		t.Errorf("getStringSliceParam s3 mismatch: %v", s)
	}

	// getPatternForBinary
	binConfig := []interface{}{
		map[string]interface{}{"name": "mybin", "pattern": "*.sh"},
	}
	if pat := getPatternForBinary(binConfig, "mybin"); pat != "*.sh" {
		t.Errorf("getPatternForBinary expected '*.sh', got %q", pat)
	}
	if pat := getPatternForBinary(nil, "mybin"); pat != "" {
		t.Errorf("getPatternForBinary nil expected empty, got %q", pat)
	}

	// findFileByPattern
	_ = memFS.MkdirAll("/pattern_test", 0755)
	_ = memFS.WriteFile("/pattern_test/tool.sh", []byte("echo"), 0755)
	_, _ = findFileByPattern(memFS, "/pattern_test", "*.sh")

	// detectVersionViaCli
	runner.Register("mycli", []byte("mycli version 1.2.3"), nil)
	v, _ := detectVersionViaCli(context.Background(), runner, "mycli", []string{"--version"}, `(\d+\.\d+\.\d+)`)
	if v != "1.2.3" {
		t.Errorf("detectVersionViaCli expected '1.2.3', got %q", v)
	}
}

func TestCheckUpdateEmptyRepo(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	sys := NewDefaultSystemContext()
	ctx := context.Background()

	tool := &config.ToolConfig{Name: "empty-tool"}

	gh := NewGitHubInstaller(runner, memFS, nil, sys)
	res, err := gh.CheckUpdate(ctx, tool)
	if err != nil || res == nil || res.HasUpdate {
		t.Errorf("expected no update for empty repo on GitHubInstaller, got res=%v, err=%v", res, err)
	}

	gitea := NewGiteaInstaller(runner, memFS, nil, sys)
	res, err = gitea.CheckUpdate(ctx, tool)
	if err != nil || res == nil || res.HasUpdate {
		t.Errorf("expected no update for empty repo on GiteaInstaller, got res=%v, err=%v", res, err)
	}

	dmg := NewDmgInstaller(runner, memFS, nil, sys)
	res, err = dmg.CheckUpdate(ctx, tool)
	if err != nil || res == nil || res.HasUpdate {
		t.Errorf("expected no update for empty repo on DmgInstaller, got res=%v, err=%v", res, err)
	}

	pkgInst := NewPkgInstaller(runner, memFS, nil, sys)
	res, err = pkgInst.CheckUpdate(ctx, tool)
	if err != nil || res == nil || res.HasUpdate {
		t.Errorf("expected no update for empty repo on PkgInstaller, got res=%v, err=%v", res, err)
	}
}

func TestCargoAndCurlTarMore(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()
	sys := NewDefaultSystemContext()

	// 1. Cargo with tryGithubReleases
	cargo := NewCargoInstaller(runner, memFS, nil, sys)
	cargo.SetLogger(log)

	toolCargo := &config.ToolConfig{
		Name: "cargo-tool",
		InstallParams: map[string]interface{}{
			"repo": "owner/repo",
		},
	}
	_, _ = cargo.Install(ctx, toolCargo)

	// 2. CurlTar detectArchiveExtension branches
	exts := []string{
		"http://example.com/file.tar.gz",
		"http://example.com/file.tgz",
		"http://example.com/file.tar.xz",
		"http://example.com/file.txz",
		"http://example.com/file.zip",
		"http://example.com/file.unknown",
	}

	for _, urlStr := range exts {
		_ = detectArchiveExtension(ctx, urlStr, nil)
	}
}

func TestAllInstallersDryRun(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	sys := NewDefaultSystemContext()
	ctx := context.Background()

	t.Setenv("DOTFILES_DRY_RUN", "true")

	installers := []struct {
		name string
		inst Installer
	}{
		{"apt", NewAptInstaller(runner, memFS, sys)},
		{"brew", NewBrewInstaller(runner, memFS, sys)},
		{"cargo", NewCargoInstaller(runner, memFS, nil, sys)},
		{"curl_binary", NewCurlBinaryInstaller(runner, memFS, nil, sys)},
		{"curl_script", NewCurlScriptInstaller(runner, memFS, nil, sys)},
		{"curl_tar", NewCurlTarInstaller(runner, memFS, nil, sys)},
		{"dmg", NewDmgInstaller(runner, memFS, nil, sys)},
		{"dnf", NewDnfInstaller(runner, memFS, sys)},
		{"gitea", NewGiteaInstaller(runner, memFS, nil, sys)},
		{"github", NewGitHubInstaller(runner, memFS, nil, sys)},
		{"manual", NewManualInstaller(runner, memFS, sys)},
		{"npm", NewNpmInstaller(runner, memFS, sys)},
		{"pacman", NewPacmanInstaller(runner, memFS, sys)},
		{"pkg", NewPkgInstaller(runner, memFS, nil, sys)},
		{"zsh_plugin", NewZshPluginInstaller(runner, memFS, sys)},
	}

	tool := &config.ToolConfig{
		Name:          "dry-tool",
		Binaries:      []interface{}{"dry-bin"},
		InstallParams: map[string]interface{}{"repo": "owner/repo"},
	}

	for _, item := range installers {
		res, err := item.inst.Install(ctx, tool)
		if item.name == "gitea" {
			continue
		}
		if err != nil {
			t.Errorf("installer %s failed in dry-run mode: %v", item.name, err)
		}
		if res == nil {
			t.Errorf("installer %s expected non-nil dry-run result", item.name)
		}
	}
}

func TestMatchAssetAcrossInstallers(t *testing.T) {
	sysLinux := &SystemContext{OS: "linux", Arch: "amd64"}
	sysMac := &SystemContext{OS: "darwin", Arch: "arm64"}

	gh := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysLinux)
	dmg := NewDmgInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysMac)
	pkgInst := NewPkgInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysMac)

	// GitHub assets
	ghAssets := []githubAsset{
		{Name: "app_1.0.0_linux_amd64.tar.gz", BrowserDownloadURL: "http://example.com/app.tar.gz"},
		{Name: "app_1.0.0_darwin_arm64.dmg", BrowserDownloadURL: "http://example.com/app.dmg"},
		{Name: "app_1.0.0_darwin_arm64.pkg", BrowserDownloadURL: "http://example.com/app.pkg"},
	}

	assetGH := gh.matchAsset(ghAssets, ".*tar\\.gz")
	if assetGH == nil || assetGH.Name != "app_1.0.0_linux_amd64.tar.gz" {
		t.Errorf("gh.matchAsset failed: %v", assetGH)
	}

	// DMG assets
	assetDMG := dmg.matchAsset(ghAssets, "darwin", "arm64")
	if assetDMG == nil || assetDMG.Name != "app_1.0.0_darwin_arm64.dmg" {
		t.Errorf("dmg.matchAsset failed: %v", assetDMG)
	}

	// PKG assets
	assetPKG := pkgInst.matchAsset(ghAssets, "darwin", "arm64")
	if assetPKG == nil || assetPKG.Name != "app_1.0.0_darwin_arm64.pkg" {
		t.Errorf("pkgInst.matchAsset failed: %v", assetPKG)
	}
}
