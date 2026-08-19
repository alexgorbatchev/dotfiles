package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestInstallerHelperMethodsAndUninstall(t *testing.T) {
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	log := logger.New(logger.Config{Writer: io.Discard})

	apt := NewAptInstaller(runner, memFS, sysCtx)
	brew := NewBrewInstaller(runner, memFS, sysCtx)
	cargo := NewCargoInstaller(runner, memFS, dl, sysCtx)
	curlBin := NewCurlBinaryInstaller(runner, memFS, dl, sysCtx)
	curlScript := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	curlTar := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	dmg := NewDmgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	dnf := NewDnfInstaller(runner, memFS, sysCtx)
	gitea := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	manual := NewManualInstaller(runner, memFS, sysCtx)
	npm := NewNpmInstaller(runner, memFS, sysCtx)
	pacman := NewPacmanInstaller(runner, memFS, sysCtx)
	pkgInst := NewPkgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	zshPlug := NewZshPluginInstaller(runner, memFS, sysCtx)

	// 1. SetFS and SetLogger helpers on all installers
	installers := []Installer{apt, brew, cargo, curlBin, curlScript, curlTar, dmg, dnf, gitea, gh, manual, npm, pacman, pkgInst, zshPlug}
	for _, inst := range installers {
		SetFS(inst, memFS)
		SetLogger(inst, log)
	}

	// 2. detectVersionViaCli
	runner.Register("/bin/cli-tool", []byte("cli-tool version 1.5.0\n"), nil)
	_ = memFS.WriteFile("/bin/cli-tool", []byte("bin"), 0755)

	v, err := detectVersionViaCli(context.Background(), runner, "/bin/cli-tool", []string{"--version"}, `(\d+\.\d+\.\d+)`)
	if err != nil || v != "1.5.0" {
		t.Errorf("detectVersionViaCli failed: v=%q, err=%v", v, err)
	}

	// 3. Uninstall calls
	tool := &config.ToolConfig{
		Name: "test-pkg-mgr",
		InstallParams: map[string]interface{}{
			"pkgName": "test-pkg",
			"url":     "http://127.0.0.1/test.tar.gz",
		},
	}

	for _, inst := range installers {
		_ = inst.Uninstall(context.Background(), tool)
	}

	// 4. findFileByPattern & getPatternForBinary
	_ = memFS.MkdirAll("/dest/sub", 0755)
	_ = memFS.WriteFile("/dest/sub/bin", []byte("bin"), 0755)
	foundPath, _ := findFileByPattern(memFS, "/dest", "sub/bin")
	if foundPath != "/dest/sub/bin" {
		t.Errorf("findFileByPattern failed: got %q", foundPath)
	}

	binaries := []interface{}{
		map[string]interface{}{"name": "b1", "pattern": "pat1"},
		config.BinaryConfig{Name: "b2", Pattern: "pat2"},
		&config.BinaryConfig{Name: "b3", Pattern: "pat3"},
	}
	if p := getPatternForBinary(binaries, "b1"); p != "pat1" {
		t.Errorf("getPatternForBinary(b1) = %q, want 'pat1'", p)
	}
	if p := getPatternForBinary(binaries, "b2"); p != "pat2" {
		t.Errorf("getPatternForBinary(b2) = %q, want 'pat2'", p)
	}
	if p := getPatternForBinary(binaries, "b3"); p != "pat3" {
		t.Errorf("getPatternForBinary(b3) = %q, want 'pat3'", p)
	}

	// 5. Test matchAsset directly
	assets := []githubAsset{
		{Name: "app-v1-darwin-arm64.dmg"},
		{Name: "app-v1-darwin-x86_64.zip"},
		{Name: "app-v1-darwin-universal.dmg"},
		{Name: "app-v1-linux-amd64.tar.gz"},
		{Name: "app-v1-windows-amd64.exe"},
		{Name: "other.txt"},
	}

	_ = dmg.matchAsset(assets, "*.dmg", "")
	_ = dmg.matchAsset(assets, "", "*.zip")
	_ = dmg.matchAsset(assets, "", "")

	_ = pkgInst.matchAsset(assets, "*.dmg", "")
	_ = pkgInst.matchAsset(assets, "", "")

	giteaAssets := []giteaAsset{
		{Name: "app-v1-linux-amd64.tar.gz"},
		{Name: "app-v1-linux-arm64.tar.gz"},
		{Name: "app-v1-darwin-amd64.tar.gz"},
		{Name: "other.txt"},
	}
	_ = matchAsset(giteaAssets, "linux", "amd64", "*.tar.gz")
	_ = matchAsset(giteaAssets, "linux", "amd64", "")

	_ = gh.matchAsset(assets, "*.tar.gz")
	_ = gh.matchAsset(assets, "")

	// 6. Test IsDryRun, GetBinaryNames, PromoteBinaries
	t.Setenv("DOTFILES_DRY_RUN", "true")
	if !IsDryRun() {
		t.Errorf("expected IsDryRun() to be true")
	}

	namesEmpty := GetBinaryNames("default-tool", nil)
	if len(namesEmpty) != 1 || namesEmpty[0] != "default-tool" {
		t.Errorf("expected ['default-tool'], got %v", namesEmpty)
	}

	namesStruct := GetBinaryNames("tool", []interface{}{
		config.BinaryConfig{Name: "b1"},
		&config.BinaryConfig{Name: "b2"},
	})
	if len(namesStruct) != 2 || namesStruct[0] != "b1" || namesStruct[1] != "b2" {
		t.Errorf("expected ['b1', 'b2'], got %v", namesStruct)
	}

	// PromoteBinaries in nested dir
	_ = memFS.MkdirAll("/nested/deep", 0755)
	_ = memFS.WriteFile("/nested/deep/nestedbin", []byte("bin"), 0755)
	promoted, err := PromoteBinaries(memFS, "/nested", "nestedbin", nil)
	if err != nil || len(promoted) != 1 || promoted[0] != "nestedbin" {
		t.Errorf("PromoteBinaries nested failed: promoted=%v, err=%v", promoted, err)
	}
}

func TestInstallersInstallPipeline(t *testing.T) {
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// Create test tar.gz archive payload
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	_ = tw.WriteHeader(&tar.Header{Name: "mybin", Mode: 0755, Size: 7})
	_, _ = tw.Write([]byte("content"))
	_ = tw.Close()
	_ = gw.Close()
	tarData := buf.Bytes()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/archive.tar.gz" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarData)
			return
		}
		if r.URL.Path == "/binary" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("raw binary"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		release := map[string]interface{}{
			"tag_name": "v1.0.0",
			"assets": []map[string]interface{}{
				{"name": "testtool-v1.0.0-linux-amd64.tar.gz", "browser_download_url": "http://" + r.Host + "/archive.tar.gz"},
			},
		}
		_ = json.NewEncoder(w).Encode(release)
	}))
	defer server.Close()

	// 1. CurlTarInstaller Install
	curlTar := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	curlTar.BinDir = "/test/curltar"
	tTar := &config.ToolConfig{
		Name:     "curltar-tool",
		Binaries: []interface{}{"mybin"},
		InstallParams: map[string]interface{}{
			"url": server.URL + "/archive.tar.gz",
		},
	}
	resTar, err := curlTar.Install(context.Background(), tTar)
	if err != nil || resTar == nil {
		t.Fatalf("CurlTar Install failed: err=%v", err)
	}

	// 2. CurlBinaryInstaller Install
	curlBin := NewCurlBinaryInstaller(runner, memFS, dl, sysCtx)
	curlBin.BinDir = "/test/curlbin"
	tBin := &config.ToolConfig{
		Name: "curlbin-tool",
		InstallParams: map[string]interface{}{
			"url": server.URL + "/binary",
		},
	}
	resBin, err := curlBin.Install(context.Background(), tBin)
	if err != nil || resBin == nil {
		t.Fatalf("CurlBinary Install failed: err=%v", err)
	}

	// 3. CurlScriptInstaller Install
	curlScript := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	curlScript.BinDir = "/test/curlscript"
	tScript := &config.ToolConfig{
		Name: "curlscript-tool",
		InstallParams: map[string]interface{}{
			"url":   server.URL + "/binary",
			"shell": "bash",
		},
	}
	runner.RegisterFunc("bash", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/test/curlscript", 0755)
		_ = memFS.WriteFile("/test/curlscript/curlscript-tool", []byte("bin"), 0755)
		return nil
	})
	resScript, err := curlScript.Install(context.Background(), tScript)
	if err != nil || resScript == nil {
		t.Fatalf("CurlScript Install failed: err=%v", err)
	}

	// 4. GiteaInstaller Install
	gitea := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	gitea.httpClient = server.Client()
	gitea.BinDir = "/test/gitea"
	tGitea := &config.ToolConfig{
		Name:     "gitea-tool",
		Binaries: []interface{}{"mybin"},
		InstallParams: map[string]interface{}{
			"repo":        "owner/repo",
			"instanceUrl": server.URL,
		},
	}
	resGitea, err := gitea.Install(context.Background(), tGitea)
	if err != nil || resGitea == nil {
		t.Fatalf("Gitea Install failed: err=%v", err)
	}
}

func TestInstallerParamsAndUtilities(t *testing.T) {
	params := map[string]interface{}{
		"str":   "hello",
		"flag1": true,
		"flag2": "true",
		"flag3": "1",
		"flag4": false,
		"slice": []interface{}{"a", "b"},
		"ss":    []string{"c", "d"},
	}

	if v := getStringParam(params, "str", "default"); v != "hello" {
		t.Errorf("getStringParam = %q, want 'hello'", v)
	}
	if v := getStringParam(params, "missing", "def"); v != "def" {
		t.Errorf("getStringParam missing = %q, want 'def'", v)
	}

	if !getBoolParam(params, "flag1", false) {
		t.Errorf("getBoolParam flag1 failed")
	}
	if !getBoolParam(params, "flag2", false) {
		t.Errorf("getBoolParam flag2 failed")
	}
	if !getBoolParam(params, "flag3", false) {
		t.Errorf("getBoolParam flag3 failed")
	}
	if getBoolParam(params, "flag4", true) {
		t.Errorf("getBoolParam flag4 failed")
	}
	if !getBoolParam(params, "missing", true) {
		t.Errorf("getBoolParam missing failed")
	}

	s1 := getStringSliceParam(params, "slice")
	if len(s1) != 2 || s1[0] != "a" || s1[1] != "b" {
		t.Errorf("getStringSliceParam slice failed: %v", s1)
	}
	s2 := getStringSliceParam(params, "ss")
	if len(s2) != 2 || s2[0] != "c" || s2[1] != "d" {
		t.Errorf("getStringSliceParam ss failed: %v", s2)
	}

	if IsDryRun() {
		t.Errorf("expected IsDryRun false by default")
	}

	tool := &config.ToolConfig{
		Name:     "mytool",
		Binaries: []interface{}{"bin1", map[string]interface{}{"name": "bin2"}},
	}
	bins := GetBinaryNames(tool.Name, tool.Binaries)
	if len(bins) != 2 || bins[0] != "bin1" || bins[1] != "bin2" {
		t.Errorf("GetBinaryNames failed: %v", bins)
	}

	defBins := GetBinaryNames("fallback", nil)
	if len(defBins) != 1 || defBins[0] != "fallback" {
		t.Errorf("GetBinaryNames empty failed: %v", defBins)
	}

	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/tmp/dir/sub", 0755)
	_ = memFS.WriteFile("/tmp/dir/sub/file.txt", []byte("data"), 0644)
	if err := removeAll(memFS, "/tmp/dir"); err != nil {
		t.Fatalf("removeAll failed: %v", err)
	}
	if exists, _ := memFS.Exists("/tmp/dir"); exists {
		t.Errorf("removeAll failed to delete directory")
	}
}

func TestPackageManagerInstallers(t *testing.T) {
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// Apt
	apt := NewAptInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("apt-get", func(c *exec.MockCmd) error {
		_ = memFS.WriteFile("/usr/bin/aptpkg", []byte("bin"), 0755)
		return nil
	})
	runner.Register("/usr/bin/aptpkg", []byte("aptpkg 1.0.0"), nil)
	tApt := &config.ToolConfig{
		Name:          "aptpkg",
		Sudo:          true,
		InstallParams: map[string]interface{}{"pkgName": "aptpkg"},
		Binaries:      []interface{}{"aptpkg"},
	}
	resApt, err := apt.Install(context.Background(), tApt)
	if err != nil || resApt == nil {
		t.Fatalf("Apt Install failed: %v", err)
	}

	// Dnf
	dnf := NewDnfInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("dnf", func(c *exec.MockCmd) error {
		_ = memFS.WriteFile("/usr/bin/dnfpkg", []byte("bin"), 0755)
		return nil
	})
	runner.Register("/usr/bin/dnfpkg", []byte("dnfpkg 1.0.0"), nil)
	tDnf := &config.ToolConfig{
		Name:          "dnfpkg",
		Sudo:          true,
		InstallParams: map[string]interface{}{"pkgName": "dnfpkg"},
		Binaries:      []interface{}{"dnfpkg"},
	}
	resDnf, err := dnf.Install(context.Background(), tDnf)
	if err != nil || resDnf == nil {
		t.Fatalf("Dnf Install failed: %v", err)
	}

	// Pacman
	pacman := NewPacmanInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("pacman", func(c *exec.MockCmd) error {
		_ = memFS.WriteFile("/usr/bin/pacpkg", []byte("bin"), 0755)
		return nil
	})
	runner.Register("/usr/bin/pacpkg", []byte("pacpkg 1.0.0"), nil)
	tPac := &config.ToolConfig{
		Name:          "pacpkg",
		Sudo:          true,
		InstallParams: map[string]interface{}{"pkgName": "pacpkg"},
		Binaries:      []interface{}{"pacpkg"},
	}
	resPac, err := pacman.Install(context.Background(), tPac)
	if err != nil || resPac == nil {
		t.Fatalf("Pacman Install failed: %v", err)
	}

	// Npm
	npm := NewNpmInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("npm", func(c *exec.MockCmd) error {
		_ = memFS.WriteFile("/usr/bin/npmpkg", []byte("bin"), 0755)
		return nil
	})
	tNpm := &config.ToolConfig{
		Name:          "npmpkg",
		InstallParams: map[string]interface{}{"package": "npmpkg"},
		Binaries:      []interface{}{"npmpkg"},
	}
	resNpm, err := npm.Install(context.Background(), tNpm)
	if err != nil || resNpm == nil {
		t.Fatalf("Npm Install failed: %v", err)
	}

	// ZshPlugin
	zsh := NewZshPluginInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("git", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/tmp/zsh-plugin", 0755)
		_ = memFS.WriteFile("/tmp/zsh-plugin/plugin.zsh", []byte("plugin"), 0644)
		return nil
	})
	tZsh := &config.ToolConfig{
		Name:          "myplugin",
		InstallParams: map[string]interface{}{"repo": "zsh-users/zsh-autosuggestions", "source": "plugin.zsh"},
	}
	resZsh, err := zsh.Install(context.Background(), tZsh)
	if err != nil || resZsh == nil {
		t.Fatalf("ZshPlugin Install failed: %v", err)
	}

	// Manual
	manual := NewManualInstaller(runner, memFS, sysCtx)
	tManual := &config.ToolConfig{
		Name:          "manual-tool",
		InstallParams: map[string]interface{}{"script": "echo manual"},
	}
	resManual, err := manual.Install(context.Background(), tManual)
	if err != nil || resManual == nil {
		t.Fatalf("Manual Install failed: %v", err)
	}
}

func TestInstallerEdgeCasesAndFallbacks(t *testing.T) {
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. Brew getBrewPrefix & getBrewVersion
	brew := NewBrewInstaller(runner, memFS, &SystemContext{OS: "darwin", Arch: "arm64"})
	runner.Register("brew", []byte("/opt/homebrew/opt/testformula\n"), nil)
	prefix, err := brew.getBrewPrefix(context.Background(), "testformula")
	if err != nil || prefix != "/opt/homebrew/opt/testformula" {
		t.Errorf("getBrewPrefix failed: prefix=%q, err=%v", prefix, err)
	}

	// Brew getBrewPrefix fallbacks
	runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
		if len(c.Args) > 1 && c.Args[0] == "--prefix" && c.Args[1] == "testformula" {
			return errors.New("formula not installed")
		}
		if len(c.Args) == 1 && c.Args[0] == "--prefix" {
			c.SetOutput([]byte("/opt/homebrew"))
			return nil
		}
		return errors.New("brew error")
	})
	fbPrefix, err := brew.getBrewPrefix(context.Background(), "testformula")
	if err != nil || fbPrefix != "/opt/homebrew/opt/testformula" {
		t.Errorf("getBrewPrefix fallback failed: prefix=%q, err=%v", fbPrefix, err)
	}

	runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
		return errors.New("all brew cmds fail")
	})
	fb2Prefix, err := brew.getBrewPrefix(context.Background(), "testformula")
	if err != nil || fb2Prefix != "/usr/local/opt/testformula" {
		t.Errorf("getBrewPrefix second fallback failed: prefix=%q, err=%v", fb2Prefix, err)
	}

	runner.Register("brew", []byte(`[{"versions":{"stable":"2.4.0"}}]`), nil)
	ver, err := brew.getBrewVersion(context.Background(), "testformula")
	if err != nil || ver != "2.4.0" {
		t.Errorf("getBrewVersion failed: ver=%q, err=%v", ver, err)
	}

	// 2. Npm CheckUpdate
	npm := NewNpmInstaller(runner, memFS, sysCtx)
	runner.Register("npm", []byte("3.1.2\n"), nil)
	tNpm := &config.ToolConfig{
		Name:          "mynpmpackage",
		InstallParams: map[string]interface{}{"package": "mynpmpackage"},
	}
	upNpm, err := npm.CheckUpdate(context.Background(), tNpm)
	if err != nil || upNpm == nil || upNpm.LatestVersion != "3.1.2" {
		t.Errorf("Npm CheckUpdate failed: %v", upNpm)
	}

	// 3. detectArchiveExtension
	exts := map[string]string{
		"http://x.com/tool.tar.gz":  ".tar.gz",
		"http://x.com/tool.tgz":     ".tgz",
		"http://x.com/tool.tar.bz2": ".tar.bz2",
		"http://x.com/tool.tar.xz":  ".tar.xz",
		"http://x.com/tool.zip":     ".zip",
	}
	for u, expectedExt := range exts {
		if ext := detectArchiveExtension(context.Background(), u, nil); ext != expectedExt {
			t.Errorf("detectArchiveExtension(%q) = %q, want %q", u, ext, expectedExt)
		}
	}

	// 4. GitHub fetchReleaseViaGhCli & downloadAssetViaGhCli
	gh := NewGitHubInstaller(runner, memFS, downloader.NewDownloader(memFS, nil), sysCtx)
	runner.Register("gh", []byte(`{
		"tag_name": "v1.2.3",
		"assets": [{"name": "cli-tool-linux-amd64", "browser_download_url": "http://gh/dl"}]
	}`), nil)
	rel, err := gh.fetchReleaseViaGhCli(context.Background(), "owner/cli-tool", "", "")
	if err != nil || rel == nil || rel.TagName != "v1.2.3" {
		t.Errorf("fetchReleaseViaGhCli failed: rel=%v, err=%v", rel, err)
	}

	runner.RegisterFunc("gh", func(c *exec.MockCmd) error {
		_ = memFS.WriteFile("/tmp/asset.bin", []byte("asset-data"), 0644)
		return nil
	})
	if err := gh.downloadAssetViaGhCli(context.Background(), "owner/cli-tool", "v1.2.3", "cli-tool-linux-amd64", "/tmp/asset.bin"); err != nil {
		t.Errorf("downloadAssetViaGhCli failed: %v", err)
	}

	// 5. findFileWithExtension & copyDir
	_ = memFS.MkdirAll("/dmg/vol/App.app/Contents", 0755)
	_ = memFS.WriteFile("/dmg/vol/App.app/Contents/PkgInfo", []byte("APPL"), 0644)
	appPath, err := findFileWithExtension(memFS, "/dmg/vol", ".app")
	if err != nil || appPath != "/dmg/vol/App.app" {
		t.Errorf("findFileWithExtension failed: got %q, err=%v", appPath, err)
	}

	// Test findFileWithExtension miss and error paths
	noAppPath, _ := findFileWithExtension(memFS, "/dmg/vol", ".nonexistent")
	if noAppPath != "" {
		t.Errorf("expected findFileWithExtension miss to return empty string, got %q", noAppPath)
	}
	_, errBadDir := findFileWithExtension(memFS, "/bad/directory/path", ".app")
	if errBadDir == nil {
		t.Errorf("expected findFileWithExtension on bad directory to return error")
	}

	if err := copyDir(memFS, "/dmg/vol/App.app", "/dest/App.app"); err != nil {
		t.Fatalf("copyDir failed: %v", err)
	}
	if exists, _ := memFS.Exists("/dest/App.app/Contents/PkgInfo"); !exists {
		t.Errorf("copyDir failed to copy file")
	}

	// 6. ZshPluginInstaller Install error & success branches
	zsh := NewZshPluginInstaller(runner, memFS, sysCtx)
	zsh.BinDir = "/zsh/plugins"
	runner.RegisterFunc("git", func(c *exec.MockCmd) error {
		if len(c.Args) > 0 && c.Args[0] == "clone" {
			targetDir := c.Args[len(c.Args)-1]
			_ = memFS.MkdirAll(targetDir, 0755)
			_ = memFS.WriteFile(targetDir+"/plugin.zsh", []byte("zsh plugin"), 0644)
			return nil
		}
		return errors.New("git command error")
	})

	_, err = zsh.Install(context.Background(), &config.ToolConfig{
		Name: "zsh-plugin-test",
		InstallParams: map[string]interface{}{
			"repo": "owner/zsh-plugin-test",
		},
	})
	if err != nil {
		t.Errorf("ZshPlugin Install expected success, got %v", err)
	}

	// Git clone error
	runner.RegisterFunc("git", func(c *exec.MockCmd) error {
		return errors.New("clone failed")
	})
	_, err = zsh.Install(context.Background(), &config.ToolConfig{
		Name: "zsh-plugin-fail",
		InstallParams: map[string]interface{}{
			"repo": "owner/zsh-plugin-fail",
		},
	})
	if err == nil {
		t.Errorf("ZshPlugin Install expected error on git clone failure")
	}

	// 7. CurlScriptInstaller execution error
	curlScriptInst := NewCurlScriptInstaller(runner, memFS, downloader.NewDownloader(memFS, nil), sysCtx)
	scriptServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("#!/bin/sh\nexit 1\n"))
	}))
	defer scriptServer.Close()

	runner.RegisterFunc("sh", func(c *exec.MockCmd) error {
		return errors.New("script failed")
	})
	_, err = curlScriptInst.Install(context.Background(), &config.ToolConfig{
		Name: "curl-script-fail",
		InstallParams: map[string]interface{}{
			"url": scriptServer.URL,
		},
	})
	if err == nil {
		t.Errorf("CurlScript Install expected error when script execution fails")
	}

	// 9. Apt, Brew, Dnf, Npm, Pacman command error and CheckUpdate branches
	runner.RegisterFunc("apt-get", func(c *exec.MockCmd) error {
		return errors.New("apt-get error")
	})
	runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
		return errors.New("brew error")
	})
	runner.RegisterFunc("dnf", func(c *exec.MockCmd) error {
		return errors.New("dnf error")
	})
	runner.RegisterFunc("npm", func(c *exec.MockCmd) error {
		return errors.New("npm error")
	})
	runner.RegisterFunc("pacman", func(c *exec.MockCmd) error {
		return errors.New("pacman error")
	})

	aptInst := NewAptInstaller(runner, memFS, sysCtx)
	_, _ = aptInst.Install(context.Background(), &config.ToolConfig{
		Name:          "apt-fail",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})
	_, _ = aptInst.CheckUpdate(context.Background(), &config.ToolConfig{
		Name:          "apt-fail-chk",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})

	brewInst := NewBrewInstaller(runner, memFS, sysCtx)
	_, _ = brewInst.Install(context.Background(), &config.ToolConfig{
		Name:          "brew-fail",
		InstallParams: map[string]interface{}{"formula": "form1"},
	})
	_, _ = brewInst.CheckUpdate(context.Background(), &config.ToolConfig{
		Name:          "brew-fail-chk",
		InstallParams: map[string]interface{}{"formula": "form1"},
	})

	dnfInst := NewDnfInstaller(runner, memFS, sysCtx)
	_, _ = dnfInst.Install(context.Background(), &config.ToolConfig{
		Name:          "dnf-fail",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})
	_, _ = dnfInst.CheckUpdate(context.Background(), &config.ToolConfig{
		Name:          "dnf-fail-chk",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})

	npmInst := NewNpmInstaller(runner, memFS, sysCtx)
	_, _ = npmInst.Install(context.Background(), &config.ToolConfig{
		Name:          "npm-fail",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})
	_, _ = npmInst.CheckUpdate(context.Background(), &config.ToolConfig{
		Name:          "npm-fail-chk",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})

	pacmanInst := NewPacmanInstaller(runner, memFS, sysCtx)
	_, _ = pacmanInst.Install(context.Background(), &config.ToolConfig{
		Name:          "pacman-fail",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})
	_, _ = pacmanInst.CheckUpdate(context.Background(), &config.ToolConfig{
		Name:          "pacman-fail-chk",
		InstallParams: map[string]interface{}{"package": "pkg1"},
	})
}
