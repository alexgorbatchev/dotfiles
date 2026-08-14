package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestCheckBinarySizeLimits(t *testing.T) {
	tests := []struct {
		name      string
		fileSize  int64
		expectErr bool
	}{
		{
			name:      "under size limit",
			fileSize:  10 * 1024 * 1024, // 10 MB
			expectErr: false,
		},
		{
			name:      "exceeds size limit",
			fileSize:  27 * 1024 * 1024, // 27 MB
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			distDir := filepath.Join(tmpDir, ".dist")
			if err := os.MkdirAll(distDir, 0755); err != nil {
				t.Fatalf("failed to create .dist dir: %v", err)
			}

			nativeBin := "dotfiles"
			if runtime.GOOS == "windows" {
				nativeBin = "dotfiles.exe"
			}
			nativePath := filepath.Join(distDir, nativeBin)

			f, err := os.Create(nativePath)
			if err != nil {
				t.Fatalf("failed to create native binary file: %v", err)
			}
			if err := f.Truncate(tt.fileSize); err != nil {
				_ = f.Close()
				t.Fatalf("failed to truncate binary file: %v", err)
			}
			_ = f.Close()

			targets := []string{
				"alexgorbatchev/dotfiles-darwin-x64",
				"alexgorbatchev/dotfiles-darwin-arm64",
				"alexgorbatchev/dotfiles-linux-x64",
				"alexgorbatchev/dotfiles-linux-arm64",
			}

			for _, target := range targets {
				binDir := filepath.Join(distDir, "packages", target, "bin")
				if err := os.MkdirAll(binDir, 0755); err != nil {
					t.Fatalf("failed to create target bin dir: %v", err)
				}
				binPath := filepath.Join(binDir, "dotfiles")
				tf, err := os.Create(binPath)
				if err != nil {
					t.Fatalf("failed to create target binary file: %v", err)
				}
				if err := tf.Truncate(tt.fileSize); err != nil {
					_ = tf.Close()
					t.Fatalf("failed to truncate target binary file: %v", err)
				}
				_ = tf.Close()
			}

			err = checkBinarySizeLimits(tmpDir)
			if (err != nil) != tt.expectErr {
				t.Fatalf("checkBinarySizeLimits() error = %v, expectErr %v", err, tt.expectErr)
			}
		})
	}
}

func TestCopyFile(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "src.txt")
	dst := filepath.Join(tmpDir, "dst.txt")

	content := []byte("hello world test copy")
	if err := os.WriteFile(src, content, 0644); err != nil {
		t.Fatalf("failed to write src file: %v", err)
	}

	if err := copyFile(src, dst); err != nil {
		t.Fatalf("copyFile failed: %v", err)
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("failed to read dst file: %v", err)
	}

	if string(got) != string(content) {
		t.Fatalf("copyFile output mismatch: got %s, want %s", string(got), string(content))
	}
}

func TestGenerateSchemaTypes(t *testing.T) {
	tmpDir := t.TempDir()

	pkgVmDir := filepath.Join(tmpDir, "pkg", "vm")
	if err := os.MkdirAll(pkgVmDir, 0755); err != nil {
		t.Fatalf("failed to create pkg/vm dir: %v", err)
	}
	dslContent := "export interface AsyncConfigureTool { (install: any): void; }\nexport interface ConfigFactory { (): void; }"
	if err := os.WriteFile(filepath.Join(pkgVmDir, "dsl-types.ts"), []byte(dslContent), 0644); err != nil {
		t.Fatalf("failed to write dsl-types.ts: %v", err)
	}

	dashboardTypesDir := filepath.Join(tmpDir, "packages", "dashboard", "src", "shared")
	if err := os.MkdirAll(dashboardTypesDir, 0755); err != nil {
		t.Fatalf("failed to create dashboard types dir: %v", err)
	}
	genContent := "export interface ToolConfig {\n\tname: string;\n}"
	if err := os.WriteFile(filepath.Join(dashboardTypesDir, "types.gen.ts"), []byte(genContent), 0644); err != nil {
		t.Fatalf("failed to write types.gen.ts: %v", err)
	}

	if err := generateSchemaTypes(tmpDir); err != nil {
		t.Fatalf("generateSchemaTypes failed: %v", err)
	}

	indexDtsPath := filepath.Join(tmpDir, ".dist", "index.d.ts")
	content, err := os.ReadFile(indexDtsPath)
	if err != nil {
		t.Fatalf("failed to read .dist/index.d.ts: %v", err)
	}

	strContent := string(content)
	expectedDeclarations := []string{
		"defineConfig",
		"defineTool",
		"AsyncConfigureTool",
		"ToolConfig",
	}

	for _, expected := range expectedDeclarations {
		if !strings.Contains(strContent, expected) {
			t.Errorf(".dist/index.d.ts missing expected declaration %q", expected)
		}
	}
}

func TestBuildHelpers(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. getRepoRoot
	root, err := getRepoRoot()
	if err != nil || root == "" {
		t.Errorf("getRepoRoot failed: %v, %q", err, root)
	}

	// 2. cleanPreviousBuild
	distDir := filepath.Join(tmpDir, ".dist")
	dashboardDistDir := filepath.Join(tmpDir, "pkg", "dashboard", "dist")
	_ = os.MkdirAll(distDir, 0755)
	_ = os.MkdirAll(dashboardDistDir, 0755)
	_ = os.WriteFile(filepath.Join(distDir, "f.txt"), []byte("data"), 0644)

	err = cleanPreviousBuild(tmpDir)
	if err != nil {
		t.Fatalf("cleanPreviousBuild failed: %v", err)
	}

	// 3. generatePackageJsons
	rootPkg := `{"version": "1.2.3"}`
	_ = os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte(rootPkg), 0644)
	_ = os.MkdirAll(filepath.Join(tmpDir, ".dist"), 0755)

	version, err := generatePackageJsons(tmpDir)
	if err != nil || version != "1.2.3" {
		t.Fatalf("generatePackageJsons failed: %v, version=%q", err, version)
	}

	// 4. writeLauncher
	err = writeLauncher(tmpDir)
	if err != nil {
		t.Fatalf("writeLauncher failed: %v", err)
	}
	cliJsData, err := os.ReadFile(filepath.Join(tmpDir, ".dist", "cli.js"))
	if err != nil || !strings.Contains(string(cliJsData), "defineConfig") {
		t.Errorf("expected cli.js launcher generated")
	}

	// 5. copyDirectoryRecursive
	src := filepath.Join(tmpDir, "src_rec")
	dst := filepath.Join(tmpDir, "dst_rec")
	_ = os.MkdirAll(filepath.Join(src, "sub"), 0755)
	_ = os.WriteFile(filepath.Join(src, "file.txt"), []byte("hello"), 0644)
	_ = os.WriteFile(filepath.Join(src, "sub", "subfile.txt"), []byte("subhello"), 0644)

	err = copyDirectoryRecursive(src, dst)
	if err != nil {
		t.Fatalf("copyDirectoryRecursive failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dst, "sub", "subfile.txt"))
	if err != nil || string(data) != "subhello" {
		t.Errorf("copyDirectoryRecursive failed: %v, %q", err, string(data))
	}

	// 6. copyAssetsAndSkill
	_ = os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# Readme"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "LICENSE"), []byte("MIT"), 0644)
	_ = os.MkdirAll(filepath.Join(tmpDir, ".agents", "skills", "dotfiles"), 0755)
	_ = os.WriteFile(filepath.Join(tmpDir, ".agents", "skills", "dotfiles", "SKILL.md"), []byte("skill"), 0644)

	err = copyAssetsAndSkill(tmpDir)
	if err != nil {
		t.Fatalf("copyAssetsAndSkill failed: %v", err)
	}

	// 7. printBuildSummary
	printBuildSummary(tmpDir)
}

func TestBuildTarget(t *testing.T) {
	root, err := getRepoRoot()
	if err != nil {
		t.Fatalf("getRepoRoot failed: %v", err)
	}

	tmpDir := t.TempDir()
	outBin := filepath.Join(tmpDir, "test_dotfiles_bin")

	err = buildTarget(root, runtime.GOOS, runtime.GOARCH, outBin)
	if err != nil {
		t.Fatalf("buildTarget failed: %v", err)
	}

	if _, err := os.Stat(outBin); err != nil {
		t.Errorf("expected compiled binary at %s", outBin)
	}
}

func TestRunTypegenAndBuildNative(t *testing.T) {
	root, err := getRepoRoot()
	if err != nil {
		t.Fatalf("getRepoRoot failed: %v", err)
	}

	err = runTypegen(root)
	if err != nil {
		t.Fatalf("runTypegen failed: %v", err)
	}

	err = compileAllBinaries(root)
	if err != nil {
		t.Fatalf("compileAllBinaries failed: %v", err)
	}
}

func TestRunBuild(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping full build test in short mode")
	}

	err := runBuild()
	if err != nil {
		t.Fatalf("runBuild failed: %v", err)
	}
}

func TestBuildErrorBranches(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. generatePackageJsons with missing file
	_, err := generatePackageJsons(tmpDir)
	if err == nil {
		t.Error("expected error with missing package.json")
	}

	// 2. generatePackageJsons with invalid JSON
	_ = os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte("invalid json"), 0644)
	_, err = generatePackageJsons(tmpDir)
	if err == nil {
		t.Error("expected error with invalid package.json")
	}

	// 3. generatePackageJsons with missing version
	_ = os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte("{}"), 0644)
	_, err = generatePackageJsons(tmpDir)
	if err == nil {
		t.Error("expected error with package.json missing version")
	}

	// 4. copyFile non-existent source
	err = copyFile(filepath.Join(tmpDir, "nonexistent.txt"), filepath.Join(tmpDir, "dst.txt"))
	if err == nil {
		t.Error("expected error copying non-existent file")
	}

	// 5. copyDirectoryRecursive non-existent source
	err = copyDirectoryRecursive(filepath.Join(tmpDir, "nonexistent_dir"), filepath.Join(tmpDir, "dst_dir"))
	if err == nil {
		t.Error("expected error copying non-existent directory")
	}

	// 6. copyDirectoryRecursive with symlink
	srcDir := filepath.Join(tmpDir, "src_sym")
	dstDir := filepath.Join(tmpDir, "dst_sym")
	_ = os.MkdirAll(srcDir, 0755)
	targetFile := filepath.Join(srcDir, "target.txt")
	_ = os.WriteFile(targetFile, []byte("target"), 0644)
	symFile := filepath.Join(srcDir, "symlink.txt")
	_ = os.Symlink(targetFile, symFile)

	err = copyDirectoryRecursive(srcDir, dstDir)
	if err != nil {
		t.Fatalf("copyDirectoryRecursive with symlink failed: %v", err)
	}

	// 7. buildDashboard non-existent root
	err = buildDashboard(filepath.Join(tmpDir, "nonexistent"))
	if err == nil {
		t.Error("expected error building dashboard in nonexistent root")
	}

	// 8. runTypegen non-existent root
	err = runTypegen(filepath.Join(tmpDir, "nonexistent"))
	if err == nil {
		t.Error("expected error running typegen in nonexistent root")
	}

	// 9. runTypeTests non-existent root
	err = runTypeTests(filepath.Join(tmpDir, "nonexistent"))
	if err == nil {
		t.Error("expected error running typeTests in nonexistent root")
	}

	// 10. checkBinarySizeLimits missing dist dir
	err = checkBinarySizeLimits(tmpDir)
	if err == nil {
		t.Error("expected error from checkBinarySizeLimits with missing dist dir")
	}
}
