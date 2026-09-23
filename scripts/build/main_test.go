package main

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// writeSizedFile creates a file of exactly size bytes. Truncate extends it sparsely,
// so a budget-sized fixture costs no real disk space.
func writeSizedFile(t *testing.T, path string, size int64) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("creating %s: %v", path, err)
	}
	if err := f.Truncate(size); err != nil {
		_ = f.Close()
		t.Fatalf("sizing %s: %v", path, err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("closing %s: %v", path, err)
	}
}

// writeReleaseBinaries lays out one binary per release target at the paths
// compileAllBinaries builds them to, each of the size sizeOf returns for it.
func writeReleaseBinaries(t *testing.T, sizeOf func(releaseTarget) int64) []string {
	t.Helper()
	paths := releaseBinaryPaths(t.TempDir())
	for i, target := range releaseTargets {
		writeSizedFile(t, paths[i], sizeOf(target))
	}
	return paths
}

// compileAllBinaries hands the size check one path per release target, not only the
// build host's binary, so every platform is measured wherever the build runs.
func TestReleaseBinaryPathsCoverEveryReleaseTarget(t *testing.T) {
	dir := t.TempDir()
	paths := releaseBinaryPaths(dir)
	if len(paths) != len(releaseTargets) {
		t.Fatalf("releaseBinaryPaths() returned %d paths for %d release targets: %v", len(paths), len(releaseTargets), paths)
	}
	for i, target := range releaseTargets {
		if want := filepath.Join(dir, target.binaryName()); paths[i] != want {
			t.Errorf("path for %s/%s = %q, want %q", target.goos, target.goarch, paths[i], want)
		}
	}
}

// A release with any target over the budget stops before its checksums are written,
// so a release that failed the check has no checksums.txt beside its archives.
func TestFinishReleaseWritesChecksumsOnlyWithinBudget(t *testing.T) {
	tests := []struct {
		name          string
		size          func(releaseTarget) int64
		wantErr       bool
		wantChecksums bool
	}{
		{
			name:          "every binary within budget",
			size:          func(releaseTarget) int64 { return maxBinarySizeBytes },
			wantChecksums: true,
		},
		{
			name: "last target over budget",
			size: func(target releaseTarget) int64 {
				if target == releaseTargets[len(releaseTargets)-1] {
					return maxBinarySizeBytes + 1
				}
				return maxBinarySizeBytes
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			distDir := t.TempDir()
			paths := writeReleaseBinaries(t, tt.size)

			err := finishRelease(io.Discard, distDir, paths)
			if (err != nil) != tt.wantErr {
				t.Fatalf("finishRelease() error = %v, wantErr %v", err, tt.wantErr)
			}
			_, statErr := os.Stat(filepath.Join(distDir, "checksums.txt"))
			if gotChecksums := statErr == nil; gotChecksums != tt.wantChecksums {
				t.Errorf("checksums.txt written = %v, want %v (stat error: %v)", gotChecksums, tt.wantChecksums, statErr)
			}
		})
	}
}

// The budget applies to every release binary, not to whichever one happens to match
// the machine running the build. Each target in turn is pushed one byte over the
// budget while the others sit exactly on it, so the check has to fail for every
// target, including the ones that are not the build host's platform.
func TestCheckBinarySizeLimitsFailsForEveryTargetOverBudget(t *testing.T) {
	const overBudget = maxBinarySizeBytes + 1
	for _, over := range releaseTargets {
		t.Run(over.binaryName(), func(t *testing.T) {
			paths := writeReleaseBinaries(t, func(target releaseTarget) int64 {
				if target == over {
					return overBudget
				}
				return maxBinarySizeBytes
			})

			var out bytes.Buffer
			err := checkBinarySizeLimits(&out, paths)
			if err == nil {
				t.Fatalf("checkBinarySizeLimits() passed with %s at %d bytes, over the %d-byte budget", over.binaryName(), overBudget, maxBinarySizeBytes)
			}

			msg := err.Error()
			for _, want := range []string{
				over.binaryName(),
				fmt.Sprintf("%d bytes", overBudget),
				fmt.Sprintf("%d MiB", maxBinarySizeBytes/bytesPerMiB),
			} {
				if !strings.Contains(msg, want) {
					t.Errorf("error %q does not mention %q", msg, want)
				}
			}
			for _, target := range releaseTargets {
				if target != over && strings.Contains(msg, target.binaryName()) {
					t.Errorf("error %q names %s, which is within the budget", msg, target.binaryName())
				}
			}
			if strings.Contains(out.String(), "✅") {
				t.Errorf("a failed check printed a success line:\n%s", out.String())
			}
		})
	}
}

// Every binary over the budget is reported at once, so a release that has outgrown
// the budget on several platforms is not discovered one platform per build.
func TestCheckBinarySizeLimitsReportsEveryBinaryOverBudget(t *testing.T) {
	paths := writeReleaseBinaries(t, func(releaseTarget) int64 { return maxBinarySizeBytes + 1 })

	err := checkBinarySizeLimits(io.Discard, paths)
	if err == nil {
		t.Fatal("checkBinarySizeLimits() passed with every binary over the budget")
	}
	for _, target := range releaseTargets {
		if !strings.Contains(err.Error(), target.binaryName()) {
			t.Errorf("error %q does not name %s", err.Error(), target.binaryName())
		}
	}
}

// A passing check says exactly what it measured: how many binaries, which ones, and
// the budget in the unit the arithmetic uses.
func TestCheckBinarySizeLimitsPassesAndNamesWhatItChecked(t *testing.T) {
	paths := writeReleaseBinaries(t, func(releaseTarget) int64 { return maxBinarySizeBytes })

	var out bytes.Buffer
	if err := checkBinarySizeLimits(&out, paths); err != nil {
		t.Fatalf("checkBinarySizeLimits() error = %v with every binary exactly on the budget", err)
	}

	printed := out.String()
	budget := fmt.Sprintf("%d MiB", maxBinarySizeBytes/bytesPerMiB)
	success := fmt.Sprintf("✅ All %d release binaries are within the %s size budget", len(releaseTargets), budget)
	if !strings.Contains(printed, success) {
		t.Errorf("output does not contain %q:\n%s", success, printed)
	}
	for _, target := range releaseTargets {
		line := fmt.Sprintf("%s: %.2f MiB (OK)", target.binaryName(), float64(maxBinarySizeBytes)/bytesPerMiB)
		if !strings.Contains(printed, line) {
			t.Errorf("output does not contain %q:\n%s", line, printed)
		}
	}
	if strings.Contains(printed, " MB") {
		t.Errorf("output reports sizes in MB while the arithmetic is MiB:\n%s", printed)
	}
}

// With nothing to measure the check must not report that everything is within budget.
func TestCheckBinarySizeLimitsRejectsAnEmptyBinaryList(t *testing.T) {
	if err := checkBinarySizeLimits(io.Discard, nil); err == nil {
		t.Fatal("checkBinarySizeLimits() passed without measuring any binary")
	}
}

// A binary that cannot be measured does not hide the binaries measured over budget.
func TestCheckBinarySizeLimitsReportsAMissingBinaryAlongsideOverBudgetOnes(t *testing.T) {
	missing, over := releaseTargets[0], releaseTargets[1]
	overPath := filepath.Join(t.TempDir(), over.binaryName())
	writeSizedFile(t, overPath, maxBinarySizeBytes+1)
	missingPath := filepath.Join(t.TempDir(), missing.binaryName())

	err := checkBinarySizeLimits(io.Discard, []string{missingPath, overPath})
	if err == nil {
		t.Fatal("checkBinarySizeLimits() passed with one binary missing and one over the budget")
	}
	for _, want := range []string{"measuring release binary " + missing.binaryName(), "release binary " + over.binaryName() + " is"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not contain %q", err.Error(), want)
		}
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

	// The runtime globals travel as their own file beside the authoring declarations,
	// so the generator copies it and the fixture has to provide it.
	globalsContent := "declare namespace NodeJS { interface ProcessEnv { [key: string]: string | undefined; } }"
	if err := os.WriteFile(filepath.Join(pkgVmDir, "globals.d.ts"), []byte(globalsContent), 0644); err != nil {
		t.Fatalf("failed to write globals.d.ts: %v", err)
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

// A build emits exactly the current set of outputs. Every directory it regenerates is
// cleared first, so a declaration it has stopped emitting cannot survive in a checkout,
// get embedded by //go:embed all:dist, and be synced into user projects from there.
func TestCleanPreviousBuildClearsEveryGeneratedDirectory(t *testing.T) {
	tmpDir := t.TempDir()

	generated := []string{
		filepath.Join(tmpDir, ".dist"),
		filepath.Join(tmpDir, "pkg", "dashboard", "dist"),
		filepath.Join(tmpDir, "pkg", "embedded", "dist"),
	}
	const obsolete = "authoring-types.d.ts"
	for _, dir := range generated {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
		if err := os.WriteFile(filepath.Join(dir, obsolete), []byte("// emitted by an older build\n"), 0644); err != nil {
			t.Fatalf("seeding %s: %v", dir, err)
		}
	}

	if err := cleanPreviousBuild(tmpDir); err != nil {
		t.Fatalf("cleanPreviousBuild failed: %v", err)
	}

	for _, dir := range generated {
		if _, err := os.Stat(filepath.Join(dir, obsolete)); !os.IsNotExist(err) {
			t.Errorf("%s survived the clean in %s (stat error: %v)", obsolete, dir, err)
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

	err = buildTarget(root, "0.0.0-test", runtime.GOOS, runtime.GOARCH, outBin)
	if err != nil {
		t.Fatalf("buildTarget failed: %v", err)
	}

	if _, err := os.Stat(outBin); err != nil {
		t.Errorf("expected compiled binary at %s", outBin)
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
}
