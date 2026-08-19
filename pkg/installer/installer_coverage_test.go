package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestInstallerCoverageCases(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. PromoteBinaries with subfolder and pattern matching
	_ = memFS.MkdirAll("/src/bin/sub", 0755)
	_ = memFS.WriteFile("/src/bin/sub/mytool-bin", []byte("mytool"), 0755)
	promoted, err := PromoteBinaries(memFS, "/src", "/dest", []interface{}{"mytool-bin"})
	if err != nil || len(promoted) == 0 {
		t.Errorf("PromoteBinaries failed: promoted=%v, err=%v", promoted, err)
	}

	// PromoteBinaries fallback
	_ = memFS.MkdirAll("/src2/sub", 0755)
	_ = memFS.WriteFile("/src2/sub/other", []byte("other"), 0755)
	promoted2, err := PromoteBinaries(memFS, "/src2", "/dest2", []interface{}{"other"})
	if err != nil || len(promoted2) == 0 {
		t.Errorf("PromoteBinaries fallback failed: %v", err)
	}

	// 2. detectVersionViaCli error paths
	runner.RegisterFunc("badcli", func(c *exec.MockCmd) error {
		return errors.New("exec error")
	})
	_, err = detectVersionViaCli(ctx, runner, "badcli", []string{"--version"}, `(\d+\.\d+)`)
	if err == nil {
		t.Errorf("detectVersionViaCli expected error on exec failure")
	}

	runner.Register("nopatcli", []byte("no digits here"), nil)
	_, err = detectVersionViaCli(ctx, runner, "nopatcli", []string{"--version"}, `(\d+\.\d+)`)
	if err == nil {
		t.Errorf("detectVersionViaCli expected error when pattern doesn't match")
	}

	// 3. GitHubInstaller error & edge cases
	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)

	// Missing repo param
	_, err = gh.Install(ctx, &config.ToolConfig{Name: "badgh"})
	if err == nil {
		t.Errorf("GitHub Install expected error when repo is missing")
	}

	// Bad release server
	errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer errServer.Close()

	gh.httpClient = errServer.Client()
	gh.BaseURL = errServer.URL
	_, err = gh.Install(ctx, &config.ToolConfig{
		Name:          "gherr",
		InstallParams: map[string]interface{}{"repo": "owner/repo"},
	})
	if err == nil {
		t.Errorf("GitHub Install expected error on 404 response")
	}

	// 4. CurlScriptInstaller dryRun & missing url
	curlScript := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	_, err = curlScript.Install(ctx, &config.ToolConfig{Name: "noscript"})
	if err == nil {
		t.Errorf("CurlScript Install expected error when url missing")
	}

	// 5. CurlTarInstaller missing url & invalid archive
	curlTar := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	_, err = curlTar.Install(ctx, &config.ToolConfig{Name: "notar"})
	if err == nil {
		t.Errorf("CurlTar Install expected error when url missing")
	}

	// 6. DmgInstaller non-darwin OS & missing source
	dmgInst := NewDmgInstaller(runner, memFS, dl, sysCtx) // OS is linux
	resDmgLinux, err := dmgInst.Install(ctx, &config.ToolConfig{
		Name: "dmg-linux",
		InstallParams: map[string]interface{}{
			"source": map[string]interface{}{"type": "github-release", "repo": "owner/repo"},
		},
	})
	if err != nil || len(resDmgLinux.Binaries) != 0 {
		t.Errorf("Dmg Install expected empty result on non-darwin OS")
	}

	dmgDarwin := NewDmgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	_, err = dmgDarwin.Install(ctx, &config.ToolConfig{Name: "dmg-nosource"})
	if err == nil {
		t.Errorf("Dmg Install expected error when source/repo is missing")
	}

	// 7. PkgInstaller non-darwin OS & missing source
	pkgInst := NewPkgInstaller(runner, memFS, dl, sysCtx)
	resPkgLinux, err := pkgInst.Install(ctx, &config.ToolConfig{
		Name: "pkg-linux",
		InstallParams: map[string]interface{}{
			"source": map[string]interface{}{"type": "github-release", "repo": "owner/repo"},
		},
	})
	if err != nil || len(resPkgLinux.Binaries) != 0 {
		t.Errorf("Pkg Install expected empty result on non-darwin OS")
	}

	pkgDarwin := NewPkgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	_, err = pkgDarwin.Install(ctx, &config.ToolConfig{Name: "pkg-nosource"})
	if err == nil {
		t.Errorf("Pkg Install expected error when source/repo is missing")
	}

	// 8. ZshPluginInstaller missing params
	zshInst := NewZshPluginInstaller(runner, memFS, sysCtx)
	_, err = zshInst.Install(ctx, &config.ToolConfig{Name: "zsh-noparam"})
	if err == nil {
		t.Errorf("ZshPlugin Install expected error when repo/url missing")
	}

	// 9. Dmg matchAsset & Pkg matchAsset patterns
	dmgAssets := []githubAsset{
		{Name: "app-v1.0.0-mac-arm64.dmg"},
		{Name: "app-v1.0.0-mac-x86_64.dmg"},
	}
	matchedDmg := dmgDarwin.matchAsset(dmgAssets, "App", "arm64")
	if matchedDmg.Name != "app-v1.0.0-mac-arm64.dmg" {
		t.Errorf("Dmg matchAsset failed: %v", matchedDmg)
	}

	pkgAssets := []githubAsset{
		{Name: "app-v1.0.0-mac-arm64.pkg"},
		{Name: "app-v1.0.0-mac-x86_64.pkg"},
	}
	matchedPkg := pkgDarwin.matchAsset(pkgAssets, "App", "arm64")
	if matchedPkg.Name != "app-v1.0.0-mac-arm64.pkg" {
		t.Errorf("Pkg matchAsset failed: %v", matchedPkg)
	}
}

func TestDmgAndPkgInstallSuccess(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}

	// Mock server returning DMG and PKG assets
	var zipBuf bytes.Buffer
	gw := gzip.NewWriter(&zipBuf)
	tw := tar.NewWriter(gw)
	_ = tw.WriteHeader(&tar.Header{Name: "Sample.app/Contents/PkgInfo", Mode: 0644, Size: 4})
	_, _ = tw.Write([]byte("APPL"))
	_ = tw.Close()
	_ = gw.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/download/app.dmg" || r.URL.Path == "/download/app.pkg" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(zipBuf.Bytes())
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		release := map[string]interface{}{
			"tag_name": "v1.0.0",
			"assets": []map[string]interface{}{
				{"name": "Sample-v1.0.0-darwin-arm64.dmg", "browser_download_url": "http://" + r.Host + "/download/app.dmg"},
				{"name": "Sample-v1.0.0-darwin-arm64.pkg", "browser_download_url": "http://" + r.Host + "/download/app.pkg"},
			},
		}
		_ = json.NewEncoder(w).Encode(release)
	}))
	defer server.Close()

	// Mock hdiutil for DMG
	runner.RegisterFunc("hdiutil", func(c *exec.MockCmd) error {
		if len(c.Args) > 0 && c.Args[0] == "attach" {
			_ = memFS.MkdirAll("/Applications/Sample-mount/Sample.app/Contents", 0755)
			_ = memFS.WriteFile("/Applications/Sample-mount/Sample.app/Contents/PkgInfo", []byte("APPL"), 0644)
			if w := c.Stdout(); w != nil {
				_, _ = w.Write([]byte("/dev/disk2 \tApple_HFS\t/Applications/Sample-mount\n"))
			}
		}
		return nil
	})

	dmgInst := NewDmgInstaller(runner, memFS, dl, sysCtx)
	dmgInst.httpClient = server.Client()
	dmgInst.BaseURL = server.URL
	dmgInst.BinDir = "/Applications"

	tDmg := &config.ToolConfig{
		Name: "Sample",
		InstallParams: map[string]interface{}{
			"source": map[string]interface{}{
				"type": "github-release",
				"repo": "owner/Sample",
			},
		},
	}

	resDmg, err := dmgInst.Install(ctx, tDmg)
	if err != nil || resDmg == nil {
		t.Fatalf("Dmg Install failed: %v", err)
	}

	// Mock installer & pkgutil for PKG
	runner.RegisterFunc("installer", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/Applications/Sample.app", 0755)
		return nil
	})
	runner.RegisterFunc("pkgutil", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/tmp/pkgextract/Sample.app", 0755)
		return nil
	})

	pkgInst := NewPkgInstaller(runner, memFS, dl, sysCtx)
	pkgInst.httpClient = server.Client()
	pkgInst.BaseURL = server.URL
	pkgInst.BinDir = "/Applications"

	tPkg := &config.ToolConfig{
		Name: "SamplePkg",
		InstallParams: map[string]interface{}{
			"source": map[string]interface{}{
				"type": "github-release",
				"repo": "owner/SamplePkg",
			},
		},
	}

	resPkg, err := pkgInst.Install(ctx, tPkg)
	if err != nil || resPkg == nil {
		t.Fatalf("Pkg Install failed: %v", err)
	}
}

func TestInstallersDryRunCoverage(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "true")

	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	_ = tw.WriteHeader(&tar.Header{Name: "testbin", Mode: 0755, Size: 7})
	_, _ = tw.Write([]byte("content"))
	_ = tw.Close()
	_ = gw.Close()
	tarData := buf.Bytes()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/dl" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarData)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"tag_name": "v1.0.0",
			"assets": []map[string]interface{}{
				{"name": "testtool-linux-amd64.tar.gz", "browser_download_url": "http://" + r.Host + "/dl"},
			},
		})
	}))
	defer server.Close()

	tool := &config.ToolConfig{
		Name:     "testtool",
		Binaries: []interface{}{"testbin"},
		InstallParams: map[string]interface{}{
			"pkgName":     "testtool",
			"formula":     "testtool",
			"crate":       "testtool",
			"package":     "testtool",
			"repo":        "owner/testtool",
			"url":         "http://127.0.0.1/testtool",
			"source":      map[string]interface{}{"type": "github-release", "repo": "owner/testtool"},
			"instanceUrl": server.URL,
		},
	}

	giteaInst := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	giteaInst.httpClient = server.Client()

	installers := []Installer{
		NewAptInstaller(runner, memFS, sysCtx),
		NewBrewInstaller(runner, memFS, sysCtx),
		NewCargoInstaller(runner, memFS, dl, sysCtx),
		NewCurlBinaryInstaller(runner, memFS, dl, sysCtx),
		NewCurlScriptInstaller(runner, memFS, dl, sysCtx),
		NewCurlTarInstaller(runner, memFS, dl, sysCtx),
		NewDmgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"}),
		NewDnfInstaller(runner, memFS, sysCtx),
		giteaInst,
		NewGitHubInstaller(runner, memFS, dl, sysCtx),
		NewManualInstaller(runner, memFS, sysCtx),
		NewNpmInstaller(runner, memFS, sysCtx),
		NewPacmanInstaller(runner, memFS, sysCtx),
		NewPkgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"}),
		NewZshPluginInstaller(runner, memFS, sysCtx),
	}

	for _, inst := range installers {
		res, err := inst.Install(ctx, tool)
		if err != nil || res == nil {
			t.Errorf("Installer %s dryRun failed: err=%v", inst.Name(), err)
		}
	}
}

func TestInstallerDetailedBranches(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("echo hello"))
	}))
	defer server.Close()

	// 1. Brew Cask & Formula branches
	brew := NewBrewInstaller(runner, memFS, &SystemContext{OS: "darwin", Arch: "arm64"})
	runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/opt/homebrew/bin", 0755)
		_ = memFS.WriteFile("/opt/homebrew/bin/caskbin", []byte("bin"), 0755)
		if len(c.Args) > 0 && c.Args[0] == "info" {
			if w := c.Stdout(); w != nil {
				_, _ = w.Write([]byte(`[{"versions":{"stable":"1.0.0"}}]`))
			}
		}
		return nil
	})
	tBrewCask := &config.ToolConfig{
		Name:          "casktool",
		InstallParams: map[string]interface{}{"cask": true, "caskName": "casktool"},
		Binaries:      []interface{}{"caskbin"},
	}
	resBrew, err := brew.Install(ctx, tBrewCask)
	if err != nil || resBrew == nil {
		t.Fatalf("Brew cask install failed: %v", err)
	}

	// 2. Cargo standard install branch
	cargo := NewCargoInstaller(runner, memFS, dl, sysCtx)
	cargo.BinDir = "/test/cargobin"
	runner.RegisterFunc("cargo", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/test/cargobin/bin", 0755)
		_ = memFS.WriteFile("/test/cargobin/bin/cargocrate", []byte("bin"), 0755)
		return nil
	})
	tCargoStd := &config.ToolConfig{
		Name:          "cargocrate",
		InstallParams: map[string]interface{}{"crate": "cargocrate", "binarySource": "cargo"},
	}
	resCargoStd, err := cargo.Install(ctx, tCargoStd)
	if err != nil || resCargoStd == nil {
		t.Fatalf("Cargo standard install failed: %v", err)
	}

	// 3. CurlScript install
	curlScript := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	curlScript.BinDir = "/test/scriptbin"
	runner.RegisterFunc("sh", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/test/scriptbin/sub", 0755)
		_ = memFS.WriteFile("/test/scriptbin/sub/scripttool", []byte("bin"), 0755)
		return nil
	})
	tCurlScript := &config.ToolConfig{
		Name: "scripttool",
		InstallParams: map[string]interface{}{
			"url": server.URL + "/dl",
			"env": map[string]interface{}{"VAR": "1"},
		},
	}
	resCS, err := curlScript.Install(ctx, tCurlScript)
	if err != nil || resCS == nil {
		t.Fatalf("CurlScript staging install failed: %v", err)
	}

	// 4. GitHub Release Cache Hit
	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	gh.setCachedRelease("owner/cachedrepo", &githubRelease{
		TagName: "v1.0.0",
		Assets: []githubAsset{
			{Name: "tool-linux-amd64", BrowserDownloadURL: "http://127.0.0.1/dl"},
		},
	})
	cachedRel := gh.getCachedRelease("owner/cachedrepo")
	if cachedRel == nil || cachedRel.TagName != "v1.0.0" {
		t.Errorf("GitHub release cache hit failed")
	}

	// 5. Apt & Dnf & Pacman Uninstall and CheckUpdate
	apt := NewAptInstaller(runner, memFS, sysCtx)
	runner.Register("apt-get", []byte("ok"), nil)
	_ = apt.Uninstall(ctx, &config.ToolConfig{Name: "pkg", Sudo: true, InstallParams: map[string]interface{}{"pkgName": "pkg"}})

	dnf := NewDnfInstaller(runner, memFS, sysCtx)
	runner.Register("dnf", []byte("ok"), nil)
	_ = dnf.Uninstall(ctx, &config.ToolConfig{Name: "pkg", Sudo: true, InstallParams: map[string]interface{}{"pkgName": "pkg"}})

	pacman := NewPacmanInstaller(runner, memFS, sysCtx)
	runner.Register("pacman", []byte("ok"), nil)
	_ = pacman.Uninstall(ctx, &config.ToolConfig{Name: "pkg", Sudo: true, InstallParams: map[string]interface{}{"pkgName": "pkg"}})
}

func TestInstallerErrorAndCheckUpdatePaths(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. ValidateSudo error
	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	errSudo := ValidateSudo(gh, &config.ToolConfig{Name: "gh-sudo", Sudo: true})
	if errSudo == nil {
		t.Errorf("ValidateSudo expected error when Sudo is true on non-sudo installer")
	}

	// 2. CheckUpdate error paths
	badTool := &config.ToolConfig{Name: "bad"}

	// Apt checkupdate fail
	apt := NewAptInstaller(runner, memFS, sysCtx)
	_, _ = apt.CheckUpdate(ctx, badTool)

	// Dnf checkupdate fail
	dnf := NewDnfInstaller(runner, memFS, sysCtx)
	_, _ = dnf.CheckUpdate(ctx, badTool)

	// Pacman checkupdate fail
	pacman := NewPacmanInstaller(runner, memFS, sysCtx)
	_, _ = pacman.CheckUpdate(ctx, badTool)

	// CurlScript checkupdate
	curlScript := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	_, _ = curlScript.CheckUpdate(ctx, &config.ToolConfig{Name: "script"})

	// CurlTar checkupdate
	curlTar := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	_, _ = curlTar.CheckUpdate(ctx, badTool)

	// Manual checkupdate
	manual := NewManualInstaller(runner, memFS, sysCtx)
	_, _ = manual.CheckUpdate(ctx, badTool)

	// ZshPlugin checkupdate
	zsh := NewZshPluginInstaller(runner, memFS, sysCtx)
	_, _ = zsh.CheckUpdate(ctx, badTool)

	// 3. GitHub and Gitea matchAsset error paths
	assets := []githubAsset{
		{Name: "unrelated-windows-x86.exe"},
	}
	noMatchGh := gh.matchAsset(assets, "")
	if noMatchGh != nil {
		t.Errorf("github matchAsset expected nil for unmatched asset")
	}

	giteaAssets := []giteaAsset{
		{Name: "unrelated-windows-x86.exe"},
	}
	noMatchGitea := matchAsset(giteaAssets, "linux", "amd64", "")
	if noMatchGitea != nil {
		t.Errorf("gitea matchAsset expected nil for unmatched asset")
	}

	// 4. Cargo tryQuickinstall & tryGithubReleases fail
	cargo := NewCargoInstaller(runner, memFS, dl, sysCtx)
	_, errQ := cargo.tryQuickinstall(ctx, badTool, "crate", "1.0.0")
	if errQ == nil {
		t.Errorf("tryQuickinstall expected error on missing download")
	}

	_, errGH := cargo.tryGithubReleases(ctx, badTool, "crate", "1.0.0")
	if errGH == nil {
		t.Errorf("tryGithubReleases expected error on missing repo")
	}
}

func TestInstallerDeepCoverage(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. CurlTar detectArchiveExtension via HEAD request (Content-Type & Content-Disposition)
	headServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			w.Header().Set("Content-Type", "application/x-gzip")
			w.Header().Set("Content-Disposition", `attachment; filename="tool.tar.gz"`)
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data"))
	}))
	defer headServer.Close()

	ext := detectArchiveExtension(ctx, headServer.URL+"/download", headServer.Client())
	if ext != ".tar.gz" {
		t.Errorf("detectArchiveExtension HEAD request failed: %q", ext)
	}

	// 2. GitHubInstaller Install with assetPattern and CheckUpdate
	ghRelease := map[string]interface{}{
		"tag_name": "v2.5.0",
		"assets": []map[string]interface{}{
			{"name": "mycli-v2.5.0-linux-amd64.tar.gz", "browser_download_url": headServer.URL + "/download"},
		},
	}
	ghServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(ghRelease)
	}))
	defer ghServer.Close()

	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	gh.httpClient = ghServer.Client()
	gh.BaseURL = ghServer.URL
	gh.BinDir = "/test/ghbin"

	vStr := "1.0.0"
	tGh := &config.ToolConfig{
		Name:    "mycli",
		Version: &vStr,
		InstallParams: map[string]interface{}{
			"repo":         "owner/mycli",
			"assetPattern": "*linux*",
		},
	}

	resCheck, err := gh.CheckUpdate(ctx, tGh)
	if err != nil || resCheck == nil || !resCheck.HasUpdate {
		t.Errorf("GitHub CheckUpdate failed: %v", resCheck)
	}

	// 3. GiteaInstaller CheckUpdate
	gt := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	gt.httpClient = ghServer.Client()
	resGtCheck, err := gt.CheckUpdate(ctx, &config.ToolConfig{
		Name:    "mycli",
		Version: &vStr,
		InstallParams: map[string]interface{}{
			"repo":        "owner/mycli",
			"instanceUrl": ghServer.URL,
		},
	})
	if err != nil || resGtCheck == nil || !resGtCheck.HasUpdate {
		t.Errorf("Gitea CheckUpdate failed: %v", resGtCheck)
	}

	// 4. CurlBinaryInstaller Install & CheckUpdate
	curlBin := NewCurlBinaryInstaller(runner, memFS, dl, sysCtx)
	curlBin.BinDir = "/test/curlbin"
	tCurlBin := &config.ToolConfig{
		Name:    "curltool",
		Version: &vStr,
		InstallParams: map[string]interface{}{
			"url": headServer.URL + "/download",
		},
	}
	resCB, err := curlBin.Install(ctx, tCurlBin)
	if err != nil || resCB == nil {
		t.Fatalf("CurlBinary Install failed: %v", err)
	}

	resCBCheck, err := curlBin.CheckUpdate(ctx, tCurlBin)
	if err != nil || resCBCheck == nil {
		t.Errorf("CurlBinary CheckUpdate failed: %v", resCBCheck)
	}

	// 5. NpmInstaller Install & CheckUpdate
	npm := NewNpmInstaller(runner, memFS, sysCtx)
	runner.RegisterFunc("npm", func(c *exec.MockCmd) error {
		_ = memFS.MkdirAll("/usr/bin", 0755)
		_ = memFS.WriteFile("/usr/bin/npmcli", []byte("bin"), 0755)
		return nil
	})
	tNpm := &config.ToolConfig{
		Name:    "npmcli",
		Version: &vStr,
		InstallParams: map[string]interface{}{
			"package": "npmcli",
		},
		Binaries: []interface{}{"npmcli"},
	}
	resNpm, err := npm.Install(ctx, tNpm)
	if err != nil || resNpm == nil {
		t.Fatalf("Npm Install failed: %v", err)
	}

	runner.Register("npm", []byte("2.0.0\n"), nil)
	resNpmCheck, err := npm.CheckUpdate(ctx, tNpm)
	if err != nil || resNpmCheck == nil || !resNpmCheck.HasUpdate {
		t.Errorf("Npm CheckUpdate failed: %v", resNpmCheck)
	}

	// 6. removeAll non-existent path
	_ = removeAll(memFS, "/nonexistent/path/here")

	// 7. Apt & Dnf & Pacman exec failure paths
	errRunner := exec.NewMockRunner()
	errRunner.RegisterFunc("sudo", func(c *exec.MockCmd) error {
		return errors.New("sudo failed")
	})
	aptFail := NewAptInstaller(errRunner, memFS, sysCtx)
	_, errApt := aptFail.Install(ctx, &config.ToolConfig{Name: "apt-fail", Sudo: true})
	if errApt == nil {
		t.Errorf("Apt Install expected error on exec failure")
	}

	dnfFail := NewDnfInstaller(errRunner, memFS, sysCtx)
	_, errDnf := dnfFail.Install(ctx, &config.ToolConfig{Name: "dnf-fail", Sudo: true})
	if errDnf == nil {
		t.Errorf("Dnf Install expected error on exec failure")
	}

	pacFail := NewPacmanInstaller(errRunner, memFS, sysCtx)
	_, errPac := pacFail.Install(ctx, &config.ToolConfig{Name: "pac-fail", Sudo: true})
	if errPac == nil {
		t.Errorf("Pacman Install expected error on exec failure")
	}
}

func TestCargoQuickinstallAndGithubReleasesSuccess(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	_ = tw.WriteHeader(&tar.Header{Name: "cargocrate", Mode: 0755, Size: 7})
	_, _ = tw.Write([]byte("content"))
	_ = tw.Close()
	_ = gw.Close()
	tarData := buf.Bytes()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".tar.gz") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarData)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"tag_name": "v1.0.0",
			"assets": []map[string]interface{}{
				{"name": "cargocrate-v1.0.0-x86_64-unknown-linux-gnu.tar.gz", "browser_download_url": "http://" + r.Host + "/dl.tar.gz"},
			},
		})
	}))
	defer server.Close()

	cargo := NewCargoInstaller(runner, memFS, dl, sysCtx)
	cargo.httpClient = server.Client()
	cargo.BaseURL = server.URL
	cargo.BinDir = "/test/cargobin"

	tCargo := &config.ToolConfig{
		Name: "cargocrate",
		InstallParams: map[string]interface{}{
			"crate":      "cargocrate",
			"repo":       "owner/cargocrate",
			"githubRepo": "owner/cargocrate",
		},
	}

	// tryQuickinstall success
	resQ, errQ := cargo.tryQuickinstall(ctx, tCargo, "cargocrate", "1.0.0")
	if errQ != nil || resQ == nil {
		t.Fatalf("tryQuickinstall success failed: %v", errQ)
	}

	// tryGithubReleases success
	resGH, errGH := cargo.tryGithubReleases(ctx, tCargo, "cargocrate", "1.0.0")
	if errGH != nil || resGH == nil {
		t.Fatalf("tryGithubReleases success failed: %v", errGH)
	}
}

func TestMoreInstallerEdgeCases(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. GitHub Uninstall & CheckUpdate edge cases
	gh := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	_ = gh.Uninstall(ctx, &config.ToolConfig{Name: "gh-tool"})

	errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer errServer.Close()

	gh.httpClient = errServer.Client()
	gh.BaseURL = errServer.URL
	_, err := gh.CheckUpdate(ctx, &config.ToolConfig{
		Name:          "gh-404",
		InstallParams: map[string]interface{}{"repo": "owner/repo"},
	})
	if err == nil {
		t.Errorf("expected CheckUpdate error on 404 response")
	}

	// 2. Gitea Uninstall & CheckUpdate edge cases
	gt := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	_ = gt.Uninstall(ctx, &config.ToolConfig{Name: "gt-tool"})
	gt.httpClient = errServer.Client()
	_, err = gt.CheckUpdate(ctx, &config.ToolConfig{
		Name:          "gt-404",
		InstallParams: map[string]interface{}{"repo": "owner/repo", "instanceUrl": errServer.URL},
	})
	if err == nil {
		t.Errorf("expected Gitea CheckUpdate error on 404 response")
	}

	// 3. CurlTar Install extraction error
	curlTar := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	_, err = curlTar.Install(ctx, &config.ToolConfig{
		Name:          "curltar-fail",
		InstallParams: map[string]interface{}{"url": errServer.URL},
	})
	if err == nil {
		t.Errorf("expected CurlTar install error on 404 download")
	}

	// 4. CurlBinary Uninstall & CheckUpdate
	curlBin := NewCurlBinaryInstaller(runner, memFS, dl, sysCtx)
	_ = curlBin.Uninstall(ctx, &config.ToolConfig{Name: "curlbin-tool"})

	// 5. Manual Uninstall
	manual := NewManualInstaller(runner, memFS, sysCtx)
	_ = manual.Uninstall(ctx, &config.ToolConfig{Name: "manual-tool"})

	// 6. DryRun returns for all package installers
	dryParams := map[string]interface{}{
		"dryRun": true,
		"repo":   "owner/repo",
		"crate":  "somecrate",
		"url":    "http://example.com/tool",
	}
	tools := []*config.ToolConfig{
		{Name: "t1", InstallParams: dryParams},
	}

	aptInst := NewAptInstaller(runner, memFS, sysCtx)
	brewInst := NewBrewInstaller(runner, memFS, sysCtx)
	cargoInst := NewCargoInstaller(runner, memFS, dl, sysCtx)
	curlBinInst := NewCurlBinaryInstaller(runner, memFS, dl, sysCtx)
	curlScriptInst := NewCurlScriptInstaller(runner, memFS, dl, sysCtx)
	curlTarInst := NewCurlTarInstaller(runner, memFS, dl, sysCtx)
	dmgInst := NewDmgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	dnfInst := NewDnfInstaller(runner, memFS, sysCtx)
	giteaInst := NewGiteaInstaller(runner, memFS, dl, sysCtx)
	ghInst := NewGitHubInstaller(runner, memFS, dl, sysCtx)
	manualInst := NewManualInstaller(runner, memFS, sysCtx)
	npmInst := NewNpmInstaller(runner, memFS, sysCtx)
	pacmanInst := NewPacmanInstaller(runner, memFS, sysCtx)
	pkgInst := NewPkgInstaller(runner, memFS, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	zshInst := NewZshPluginInstaller(runner, memFS, sysCtx)

	for _, tc := range tools {
		_, _ = aptInst.Install(ctx, tc)
		_, _ = brewInst.Install(ctx, tc)
		_, _ = cargoInst.Install(ctx, tc)
		_, _ = curlBinInst.Install(ctx, tc)
		_, _ = curlScriptInst.Install(ctx, tc)
		_, _ = curlTarInst.Install(ctx, tc)
		_, _ = dmgInst.Install(ctx, tc)
		_, _ = dnfInst.Install(ctx, tc)
		_, _ = giteaInst.Install(ctx, tc)
		_, _ = ghInst.Install(ctx, tc)
		_, _ = manualInst.Install(ctx, tc)
		_, _ = npmInst.Install(ctx, tc)
		_, _ = pacmanInst.Install(ctx, tc)
		_, _ = pkgInst.Install(ctx, tc)
		_, _ = zshInst.Install(ctx, tc)
	}

	// 7. ValidateSudo checks
	_ = ValidateSudo(aptInst, &config.ToolConfig{Name: "t", InstallParams: map[string]interface{}{"sudo": true}})
	_ = ValidateSudo(aptInst, &config.ToolConfig{Name: "t", InstallParams: map[string]interface{}{"sudo": false}})
}

func TestPackageInstallersExtraCoverage(t *testing.T) {
	ctx := context.Background()
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. Apt with update and sudo, and without sudo
	apt := NewAptInstaller(runner, memFS, sysCtx)
	runner.Register("dpkg-query", []byte("1.2.3\n"), nil)
	runner.Register("which", []byte("/usr/bin/my-apt-pkg\n"), nil)

	_, _ = apt.Install(ctx, &config.ToolConfig{
		Name: "apt-pkg",
		Sudo: true,
		InstallParams: map[string]interface{}{
			"package": "my-apt-pkg",
			"update":  true,
		},
	})
	_, _ = apt.Install(ctx, &config.ToolConfig{
		Name: "apt-pkg2",
		InstallParams: map[string]interface{}{
			"package": "my-apt-pkg2",
			"update":  true,
		},
	})

	// 1b. Manual with binaryPath and context projectConfig, and empty path
	_ = memFS.MkdirAll("/src", 0755)
	_ = memFS.WriteFile("/src/mybin", []byte("binary payload"), 0755)
	manual := NewManualInstaller(runner, memFS, sysCtx)
	manual.BinDir = "/test/manual"

	projCtx := config.WithProjectConfig(ctx, &config.ProjectConfig{
		Paths: config.PathsConfig{DotfilesDir: "/src"},
	})
	_, errMan := manual.Install(projCtx, &config.ToolConfig{
		Name: "mybin",
		InstallParams: map[string]interface{}{
			"binaryPath": "{paths.dotfilesDir}/mybin",
		},
	})
	if errMan != nil {
		t.Errorf("expected manual install with binaryPath to succeed: %v", errMan)
	}

	mEmpty := NewManualInstaller(runner, memFS, sysCtx)
	_, _ = mEmpty.Install(ctx, &config.ToolConfig{Name: "no-path-manual"})
	_, _ = mEmpty.Install(ctx, &config.ToolConfig{Name: "nonexist", InstallParams: map[string]interface{}{"binaryPath": "/nonexistent/path/bin"}})
	_ = mEmpty.Uninstall(ctx, &config.ToolConfig{Name: "no-path-manual"})

	// 2. Brew with cask
	brew := NewBrewInstaller(runner, memFS, &SystemContext{OS: "darwin", Arch: "arm64"})
	_, _ = brew.Install(ctx, &config.ToolConfig{
		Name: "cask-pkg",
		InstallParams: map[string]interface{}{
			"cask": true,
		},
	})

	// 3. Dnf with sudo and update
	dnf := NewDnfInstaller(runner, memFS, sysCtx)
	runner.Register("rpm", []byte("2.0.0\n"), nil)

	_, _ = dnf.Install(ctx, &config.ToolConfig{
		Name: "dnf-pkg",
		Sudo: true,
		InstallParams: map[string]interface{}{
			"package": "my-dnf-pkg",
			"update":  true,
		},
	})

	// 4. Npm with global=false
	npm := NewNpmInstaller(runner, memFS, sysCtx)
	_, _ = npm.Install(ctx, &config.ToolConfig{
		Name: "npm-pkg",
		InstallParams: map[string]interface{}{
			"package": "my-npm-pkg",
			"global":  false,
		},
	})

	// 5. ZshPlugin with custom url and pluginName, explicit source, and missing params
	zsh := NewZshPluginInstaller(runner, memFS, sysCtx)
	zsh.BinDir = "/zsh/plugins2"
	_ = memFS.MkdirAll("/zsh/plugins2/custom-plugin", 0755)
	_ = memFS.WriteFile("/zsh/plugins2/custom-plugin/custom-plugin.plugin.zsh", []byte("zsh plugin source"), 0644)

	runner.RegisterFunc("git", func(c *exec.MockCmd) error {
		return nil
	})

	_, err := zsh.Install(ctx, &config.ToolConfig{
		Name: "zsh-tool",
		InstallParams: map[string]interface{}{
			"url":        "https://example.com/custom-repo.git",
			"pluginName": "custom-plugin",
		},
	})
	if err != nil {
		t.Errorf("expected zsh plugin update to succeed: %v", err)
	}

	// Missing repo and url
	_, errZshNoUrl := zsh.Install(ctx, &config.ToolConfig{Name: "no-url"})
	if errZshNoUrl == nil {
		t.Errorf("expected error on zsh plugin with missing repo and url")
	}

	// URL without repo
	_ = memFS.MkdirAll("/zsh/plugins2/urlplug", 0755)
	_ = memFS.WriteFile("/zsh/plugins2/urlplug/my-explicit-src.zsh", []byte("src"), 0644)
	_, _ = zsh.Install(ctx, &config.ToolConfig{
		Name: "urlplug",
		InstallParams: map[string]interface{}{
			"url":    "https://github.com/org/urlplug.git",
			"source": "my-explicit-src.zsh",
		},
	})
}