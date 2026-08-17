package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
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
