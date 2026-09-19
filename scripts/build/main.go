package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
)

type RootPackageJson struct {
	Version string `json:"version"`
}

func getRepoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return cwd, nil
}

func cleanPreviousBuild(rootDir string) error {
	fmt.Println("🧹 Cleaning previous build directories...")
	distPath := filepath.Join(rootDir, ".dist")
	if err := os.RemoveAll(distPath); err != nil {
		return fmt.Errorf("failed to remove .dist: %w", err)
	}
	dashboardDistPath := filepath.Join(rootDir, "pkg/dashboard/dist")
	if err := os.RemoveAll(dashboardDistPath); err != nil {
		return fmt.Errorf("failed to remove pkg/dashboard/dist: %w", err)
	}
	// The embedded declarations are regenerated from scratch below. Left in place, a
	// file the build has stopped emitting survives in every existing checkout, is
	// embedded by //go:embed all:dist into the binary built there, and is synced from
	// there into every user project.
	embeddedDistPath := filepath.Join(rootDir, "pkg/embedded/dist")
	if err := os.RemoveAll(embeddedDistPath); err != nil {
		return fmt.Errorf("failed to remove pkg/embedded/dist: %w", err)
	}
	return nil
}

func buildDashboard(rootDir string) error {
	fmt.Println("🏗️  Building Dashboard Client...")
	tmpDir := filepath.Join(rootDir, ".tmp")
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		return fmt.Errorf("failed to create .tmp directory: %w", err)
	}

	jsScriptPath := filepath.Join(tmpDir, "build_dashboard.js")
	jsContent := `import path from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";

const rootDir = process.cwd();
const entryPath = path.join(rootDir, "packages/dashboard/src/client/dashboard.html");
const outDir = path.join(rootDir, "pkg/dashboard/dist");

const result = await Bun.build({
  entrypoints: [entryPath],
  outdir: outDir,
  naming: {
    entry: "index.html",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  minify: true,
  target: "browser",
  plugins: [tailwindPlugin],
  jsx: {
    runtime: "automatic",
    importSource: "preact",
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("❌ Dashboard build failed:");
  for (const log of result.logs) {
    console.error("   " + log.toString());
  }
  process.exit(1);
} else {
  console.log("✅ Dashboard Client compiled and bundled to pkg/dashboard/dist/");
}
`
	if err := os.WriteFile(jsScriptPath, []byte(jsContent), 0644); err != nil {
		return fmt.Errorf("failed to write build_dashboard.js: %w", err)
	}
	defer os.Remove(jsScriptPath)

	cmd := exec.Command("bun", jsScriptPath)
	cmd.Dir = rootDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to execute dashboard build via bun: %w", err)
	}
	return nil
}

func runTypegen(rootDir string) error {
	fmt.Println("📝 Running Go typegen...")
	cmd := exec.Command("go", "run", "scripts/typegen/main.go")
	cmd.Dir = rootDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("typegen command failed: %w", err)
	}
	return nil
}

func generateSchemaTypes(rootDir string) error {
	fmt.Println("📝 Generating schema type files directly...")
	dslTypesPath := filepath.Join(rootDir, "pkg/vm/dsl-types.ts")
	dslBytes, err := os.ReadFile(dslTypesPath)
	if err != nil {
		return fmt.Errorf("failed to read dsl-types.ts: %w", err)
	}
	dslTypesContent := string(dslBytes)

	// Strip import statements from dsl-types.ts as all types are declared in the same ambient module
	importRegex := regexp.MustCompile(`(?s)import\s+(?:type\s+)?\{?[^};]*\}?\s+from\s+['"][^'"]+['"];?\n?`)
	dslTypesContent = importRegex.ReplaceAllString(dslTypesContent, "")

	publicDeclarationsTemplate := strings.Join([]string{
		"/**",
		" * Removes the common leading indentation from a multiline string, and the blank",
		" * lines around it. Usable as a plain function or as a tagged template.",
		" */",
		"export declare function dedentString(text: string | TemplateStringsArray, ...values: unknown[]): string;",
		"/**",
		" * Alias of dedentString.",
		" */",
		"export declare function dedentTemplate(text: string | TemplateStringsArray, ...values: unknown[]): string;",
		dslTypesContent,
		"/**",
		" * Defines the main dotfiles project configuration.",
		" *",
		" * @param callback Factory function returning project configuration paths, features, and settings.",
		" */",
		"export declare function defineConfig(callback: ConfigFactory): ConfigFactory;",
		"/**",
		" * Defines a tool configuration for installation and shell integration.",
		" *",
		" * @param callback Builder function configuring installer, binaries, symlinks, and shell settings.",
		" */",
		"export declare function defineTool(callback: AsyncConfigureTool): AsyncConfigureTool;",
		"export type {",
		"\tIManualInstallParams as z_internal_ManualInstallParams,",
		"\tICargoInstallParams as z_internal_CargoInstallParams,",
		"\tIBrewInstallParams as z_internal_BrewInstallParams,",
		"\tIAptInstallParams as z_internal_AptInstallParams,",
		"\tIPacmanInstallParams as z_internal_PacmanInstallParams,",
		"\tIDnfInstallParams as z_internal_DnfInstallParams,",
		"\tIPkgInstallParams as z_internal_PkgInstallParams,",
		"\tIDmgInstallParams as z_internal_DmgInstallParams,",
		"\tINpmInstallParams as z_internal_NpmInstallParams,",
		"\tIZshPluginInstallParams as z_internal_ZshPluginInstallParams,",
		"\tIGiteaReleaseInstallParams as z_internal_GiteaReleaseInstallParams,",
		"\tICurlTarInstallParams as z_internal_CurlTarInstallParams,",
		"\tICurlScriptInstallParams as z_internal_CurlScriptInstallParams,",
		"\tICurlBinaryInstallParams as z_internal_CurlBinaryInstallParams,",
		"\tIGithubReleaseInstallParams as z_internal_GithubReleaseInstallParams,",
		"\tIInstallParamsRegistry as z_internal_IInstallParamsRegistry,",
		"\tInstallMethod as z_internal_InstallMethod,",
		"\tISystemInfo as z_internal_ISystemInfo,",
		"\tIKnownBinNameRegistry as z_internal_IKnownBinNameRegistry,",
		"};",
	}, "\n")

	generatedTypesPath := filepath.Join(rootDir, "packages/dashboard/src/shared/types.gen.ts")
	genBytes, err := os.ReadFile(generatedTypesPath)
	if err != nil {
		return fmt.Errorf("failed to read types.gen.ts: %w", err)
	}
	generatedTypesContent := string(genBytes)

	cleanedGeneratedTypes := strings.ReplaceAll(generatedTypesContent, "/* Do not change, this code is generated from Golang structs */", "")
	cleanedGeneratedTypes = strings.TrimSpace(cleanedGeneratedTypes)

	distDir := filepath.Join(rootDir, ".dist")
	if err := os.MkdirAll(distDir, 0755); err != nil {
		return fmt.Errorf("failed to create .dist directory: %w", err)
	}

	embeddedDistDir := filepath.Join(rootDir, "pkg/embedded/dist")
	if err := os.MkdirAll(embeddedDistDir, 0755); err != nil {
		return fmt.Errorf("failed to create pkg/embedded/dist directory: %w", err)
	}

	moduleBody := strings.ReplaceAll(publicDeclarationsTemplate, "export declare function", "export function")
	combinedBody := strings.Join([]string{moduleBody, cleanedGeneratedTypes}, "\n\n")
	lines := strings.Split(combinedBody, "\n")
	for i, line := range lines {
		if len(strings.TrimSpace(line)) > 0 {
			lines[i] = "  " + line
		}
	}
	indentedBody := strings.Join(lines, "\n")

	authoringTypesDtsContent := strings.Join([]string{
		`declare module "@alexgorbatchev/dotfiles" {`,
		indentedBody,
		`}`,
		"",
		`declare module "@dotfiles/cli" {`,
		`  export * from "@alexgorbatchev/dotfiles";`,
		`}`,
	}, "\n")

	// The authoring declarations ship under one name, the one package.json's "types"
	// and "exports" point at. Extra copies under other names are imported by nothing
	// and go stale unnoticed, and "tool-types.d.ts" is taken: it is what the CLI calls
	// a project's generated bin-name registry, which has completely different contents.
	for _, dir := range []string{distDir, embeddedDistDir} {
		if err := os.WriteFile(filepath.Join(dir, "index.d.ts"), []byte(authoringTypesDtsContent), 0644); err != nil {
			return fmt.Errorf("failed to write index.d.ts to %s: %w", dir, err)
		}

		// Runtime globals travel as their own file: see pkg/vm/globals.d.ts for why they
		// must not be folded into index.d.ts.
		if err := copyFile(filepath.Join(rootDir, "pkg/vm/globals.d.ts"), filepath.Join(dir, "globals.d.ts")); err != nil {
			return fmt.Errorf("failed to write globals.d.ts to %s: %w", dir, err)
		}
	}

	fmt.Println("✅ Generated .d.ts files successfully!")
	return nil
}

func generatePackageJsons(rootDir string) (string, error) {
	fmt.Println("📦 Generating package.json files...")
	rootPkgPath := filepath.Join(rootDir, "package.json")
	rootBytes, err := os.ReadFile(rootPkgPath)
	if err != nil {
		return "", fmt.Errorf("failed to read root package.json: %w", err)
	}

	var rootPkg RootPackageJson
	if err := json.Unmarshal(rootBytes, &rootPkg); err != nil {
		return "", fmt.Errorf("failed to parse root package.json: %w", err)
	}

	version := rootPkg.Version
	if version == "" {
		return "", fmt.Errorf("version not found in root package.json")
	}

	distPkg := map[string]interface{}{
		"name":        "@alexgorbatchev/dotfiles",
		"version":     version,
		"description": "Declarative, versioned dotfiles management with generated shims and shell integration.",
		"license":     "MIT",
		"repository": map[string]string{
			"type": "git",
			"url":  "git+https://github.com/alexgorbatchev/dotfiles.git",
		},
		"homepage": "https://github.com/alexgorbatchev/dotfiles#readme",
		"bugs": map[string]string{
			"url": "https://github.com/alexgorbatchev/dotfiles/issues",
		},
		"keywords": []string{"dotfiles", "cli", "developer-tools", "tool-installer", "shell", "bun"},
		"type":     "module",
		"main":     "./cli.js",
		"bin": map[string]string{
			"dotfiles": "cli.js",
		},
		"types": "./index.d.ts",
		"exports": map[string]interface{}{
			".": map[string]interface{}{
				"types":   "./index.d.ts",
				"import":  "./cli.js",
				"default": "./cli.js",
			},
		},
		"files": []string{"*.js", "*.d.ts", "skill", "README.md", "LICENSE"},
		"publishConfig": map[string]string{
			"registry": "https://registry.npmjs.org/",
			"access":   "public",
		},
		"dependencies": map[string]string{
			"@types/bun":  "^1.3.5",
			"@types/node": "^25.0.0",
		},
		"optionalDependencies": map[string]string{
			"@alexgorbatchev/dotfiles-darwin-x64":   version,
			"@alexgorbatchev/dotfiles-darwin-arm64": version,
			"@alexgorbatchev/dotfiles-linux-x64":    version,
			"@alexgorbatchev/dotfiles-linux-arm64":  version,
		},
	}

	distPkgBytes, err := json.MarshalIndent(distPkg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal .dist/package.json: %w", err)
	}

	distDir := filepath.Join(rootDir, ".dist")
	if err := os.WriteFile(filepath.Join(distDir, "package.json"), distPkgBytes, 0644); err != nil {
		return "", fmt.Errorf("failed to write .dist/package.json: %w", err)
	}

	embeddedPkg := map[string]interface{}{
		"name":        "@alexgorbatchev/dotfiles",
		"version":     version,
		"description": "Declarative, versioned dotfiles management types.",
		"license":     "MIT",
		"type":        "module",
		"types":       "./index.d.ts",
		"exports": map[string]interface{}{
			".": map[string]interface{}{
				"types": "./index.d.ts",
			},
		},
	}

	embeddedPkgBytes, err := json.MarshalIndent(embeddedPkg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal embedded package.json: %w", err)
	}

	embeddedDistDir := filepath.Join(rootDir, "pkg/embedded/dist")
	if err := os.MkdirAll(embeddedDistDir, 0755); err == nil {
		_ = os.WriteFile(filepath.Join(embeddedDistDir, "package.json"), embeddedPkgBytes, 0644)
	}

	platforms := []struct {
		osName   string
		cpuArch  string
		nodeArch string
	}{
		{osName: "darwin", cpuArch: "x64", nodeArch: "x64"},
		{osName: "darwin", cpuArch: "arm64", nodeArch: "arm64"},
		{osName: "linux", cpuArch: "x64", nodeArch: "x64"},
		{osName: "linux", cpuArch: "arm64", nodeArch: "arm64"},
	}

	packagesDir := filepath.Join(distDir, "packages")
	if err := os.MkdirAll(packagesDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create .dist/packages directory: %w", err)
	}

	for _, plat := range platforms {
		subPkgName := fmt.Sprintf("@alexgorbatchev/dotfiles-%s-%s", plat.osName, plat.cpuArch)
		subPkgDirName := fmt.Sprintf("alexgorbatchev/dotfiles-%s-%s", plat.osName, plat.cpuArch)
		subPkgDir := filepath.Join(packagesDir, subPkgDirName)

		if err := os.MkdirAll(filepath.Join(subPkgDir, "bin"), 0755); err != nil {
			return "", fmt.Errorf("failed to create subpackage bin directory: %w", err)
		}

		subPkgJson := map[string]interface{}{
			"name":        subPkgName,
			"version":     version,
			"description": fmt.Sprintf("Statically compiled native Go binary of @alexgorbatchev/dotfiles for %s-%s.", plat.osName, plat.cpuArch),
			"license":     "MIT",
			"os":          []string{plat.osName},
			"cpu":         []string{plat.nodeArch},
			"bin": map[string]string{
				"dotfiles": "./bin/dotfiles",
			},
			"files": []string{"bin"},
			"publishConfig": map[string]string{
				"registry": "https://registry.npmjs.org/",
				"access":   "public",
			},
		}

		subPkgJsonBytes, err := json.MarshalIndent(subPkgJson, "", "  ")
		if err != nil {
			return "", fmt.Errorf("failed to marshal subpackage json: %w", err)
		}

		if err := os.WriteFile(filepath.Join(subPkgDir, "package.json"), subPkgJsonBytes, 0644); err != nil {
			return "", fmt.Errorf("failed to write subpackage package.json: %w", err)
		}
	}

	fmt.Println("✅ Generated package.json files successfully!")
	return version, nil
}

func writeLauncher(rootDir string) error {
	fmt.Println("🚀 Emitting cross-platform launcher cli.js...")
	launcherTemplate := `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platform = process.platform;
const arch = process.arch;

let binName = 'dotfiles';
if (platform === 'win32') {
  binName = 'dotfiles.exe';
}

// 1. Check local .dist binary first (useful for local development/compilation testing)
let binaryPath = path.join(__dirname, binName);

// 2. If local binary is missing, resolve path to the optional native platform package
if (!fs.existsSync(binaryPath)) {
  const subPackageName = ` + "`" + `@alexgorbatchev/dotfiles-${platform}-${arch}` + "`" + `;
  try {
    const subPackagePath = path.dirname(import.meta.resolve(subPackageName + '/package.json'));
    binaryPath = path.join(subPackagePath, 'bin', binName);
  } catch {
    console.error(` + "`" + `Error: Unsupported platform/architecture combination: ${platform}-${arch}` + "`" + `);
    process.exit(1);
  }
}

// If running as CLI binary, execute the Go subprocess
if (import.meta.url === ` + "`" + `file://${process.argv[1]}` + "`" + ` || (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('dotfiles')))) {
  const result = spawnSync(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exit(result.status ?? 0);
}

// Export design-time stubs to support Bun/Node configuration imports and evaluation
export function defineConfig(callback) { return callback; }
export function defineTool(callback) { return callback; }
export function dedentString(str) { return str; }
export function dedentTemplate(template, values) { return template; }

export const Platform = Object.freeze({ Linux: 1, MacOS: 2, Windows: 4, All: 7 });
export const Architecture = Object.freeze({ X86_64: 1, Arm64: 2, All: 3 });
`
	distDir := filepath.Join(rootDir, ".dist")
	cliJsPath := filepath.Join(distDir, "cli.js")
	if err := os.WriteFile(cliJsPath, []byte(launcherTemplate), 0755); err != nil {
		return fmt.Errorf("failed to write cli.js: %w", err)
	}
	return nil
}

func copyDirectoryRecursive(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(linkTarget, target)
		}
		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()
		dstFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer dstFile.Close()
		_, err = io.Copy(dstFile, srcFile)
		return err
	})
}

func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	info, err := srcFile.Stat()
	if err != nil {
		return err
	}

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

func copyAssetsAndSkill(rootDir string) error {
	fmt.Println("📚 Copying skill and public assets...")
	distDir := filepath.Join(rootDir, ".dist")

	assets := []string{"README.md", "LICENSE"}
	for _, asset := range assets {
		src := filepath.Join(rootDir, asset)
		dst := filepath.Join(distDir, asset)
		if _, err := os.Stat(src); err == nil {
			if err := copyFile(src, dst); err != nil {
				return fmt.Errorf("failed to copy asset %s: %w", asset, err)
			}
		}
	}

	skillSrc := filepath.Join(rootDir, ".agents", "skills", "dotfiles")
	skillDst := filepath.Join(distDir, "skill")
	embeddedSkillDst := filepath.Join(rootDir, "pkg", "embedded", "skill")

	_ = os.RemoveAll(embeddedSkillDst)
	if _, err := os.Stat(skillSrc); err == nil {
		if err := copyDirectoryRecursive(skillSrc, skillDst); err != nil {
			return fmt.Errorf("failed to copy skill directory: %w", err)
		}
		if err := copyDirectoryRecursive(skillSrc, embeddedSkillDst); err != nil {
			return fmt.Errorf("failed to copy skill directory to embedded: %w", err)
		}
	}
	return nil
}

func runTypeTests(rootDir string) error {
	fmt.Println("🔍 Running tsd type tests...")
	tsdDir := filepath.Join(rootDir, ".tmp", "tsd-tests")
	if err := os.RemoveAll(tsdDir); err != nil {
		return fmt.Errorf("failed to clean tsd-tests directory: %w", err)
	}

	typeTestsDir := filepath.Join(rootDir, "tests/type-tests")
	if err := copyDirectoryRecursive(typeTestsDir, tsdDir); err != nil {
		return fmt.Errorf("failed to copy type-tests: %w", err)
	}

	distDir := filepath.Join(rootDir, ".dist")
	genDir := filepath.Join(tsdDir, ".generated")
	if err := os.MkdirAll(genDir, 0755); err != nil {
		return fmt.Errorf("failed to create .generated directory: %w", err)
	}
	if err := copyFile(filepath.Join(distDir, "index.d.ts"), filepath.Join(genDir, "index.d.ts")); err != nil {
		return fmt.Errorf("failed to copy index.d.ts to .generated: %w", err)
	}

	pkgDir := filepath.Join(tsdDir, "node_modules", "@alexgorbatchev", "dotfiles")
	if err := os.MkdirAll(pkgDir, 0755); err != nil {
		return fmt.Errorf("failed to create node_modules/@alexgorbatchev/dotfiles: %w", err)
	}

	packageFiles := []string{"cli.js", "package.json", "index.d.ts"}
	for _, file := range packageFiles {
		src := filepath.Join(distDir, file)
		dst := filepath.Join(pkgDir, file)
		if _, err := os.Stat(src); err == nil {
			if err := copyFile(src, dst); err != nil {
				return fmt.Errorf("failed to copy %s to node_modules: %w", file, err)
			}
		}
	}

	indexDts := "export * from '@alexgorbatchev/dotfiles';\n"
	if err := os.WriteFile(filepath.Join(tsdDir, "index.d.ts"), []byte(indexDts), 0644); err != nil {
		return fmt.Errorf("failed to write index.d.ts for tsd tests: %w", err)
	}

	// The tests see the same runtime globals a tool configuration does under the
	// CLI-owned tsconfig, and nothing else: no Node or Bun types. tsd builds its program
	// from the test files alone, so the globals file is handed to it as one of them.
	if err := copyFile(filepath.Join(distDir, "globals.d.ts"), filepath.Join(tsdDir, "globals.d.ts")); err != nil {
		return fmt.Errorf("failed to copy globals.d.ts for tsd tests: %w", err)
	}

	pkgJson := map[string]interface{}{
		"name":    "tsd-tests",
		"private": true,
		"type":    "module",
		"types":   "./index.d.ts",
		"dependencies": map[string]string{
			"@alexgorbatchev/dotfiles": "file:../../.dist",
			"@types/node":              "*",
		},
	}
	pkgJsonBytes, err := json.MarshalIndent(pkgJson, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal package.json for tsd tests: %w", err)
	}
	if err := os.WriteFile(filepath.Join(tsdDir, "package.json"), pkgJsonBytes, 0644); err != nil {
		return fmt.Errorf("failed to write package.json for tsd tests: %w", err)
	}

	tsConfig := map[string]interface{}{
		"compilerOptions": map[string]interface{}{
			"target":           "ES2022",
			"module":           "ESNext",
			"moduleResolution": "bundler",
			"strict":           true,
			"noEmit":           true,
			"skipLibCheck":     true,
			"lib":              []string{"ES2022"},
		},
		"include": []string{"./**/*.d.ts", ".generated/index.d.ts"},
	}
	tsConfigBytes, err := json.MarshalIndent(tsConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal tsconfig.json for tsd tests: %w", err)
	}
	if err := os.WriteFile(filepath.Join(tsdDir, "tsconfig.json"), tsConfigBytes, 0644); err != nil {
		return fmt.Errorf("failed to write tsconfig.json for tsd tests: %w", err)
	}

	nodeModulesDir := filepath.Join(tsdDir, "node_modules")
	rootNodeModules := filepath.Join(rootDir, "node_modules")
	for _, mod := range []string{"tsd", "typescript"} {
		src := filepath.Join(rootNodeModules, mod)
		dst := filepath.Join(nodeModulesDir, mod)
		if _, err := os.Stat(src); err == nil {
			_ = os.Symlink(src, dst)
		}
	}

	cmd := exec.Command("bun", "x", "tsd", "--typings", "./index.d.ts", "--files", "./**/*.test-d.ts", "--files", "./globals.d.ts")
	cmd.Dir = tsdDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("tsd type tests failed: %w", err)
	}

	fmt.Println("✅ tsd type tests passed successfully!")
	_ = os.RemoveAll(tsdDir)
	return nil
}

const maxBinarySizeBytes int64 = 26 * 1024 * 1024

func createTarGz(tarPath string, files map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(tarPath), 0755); err != nil {
		return err
	}
	out, err := os.Create(tarPath)
	if err != nil {
		return err
	}
	defer out.Close()

	gw := gzip.NewWriter(out)
	defer gw.Close()

	tw := tar.NewWriter(gw)
	defer tw.Close()

	for archiveName, srcPath := range files {
		info, err := os.Stat(srcPath)
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, info.Name())
		if err != nil {
			return err
		}

		header.Name = archiveName
		if err := tw.WriteHeader(header); err != nil {
			return err
		}

		file, err := os.Open(srcPath)
		if err != nil {
			return err
		}
		_, err = io.Copy(tw, file)
		file.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func generateChecksums(distDir string) error {
	entries, err := os.ReadDir(distDir)
	if err != nil {
		return err
	}

	var lines []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".tar.gz") {
			continue
		}
		filePath := filepath.Join(distDir, entry.Name())
		f, err := os.Open(filePath)
		if err != nil {
			return err
		}
		h := sha256.New()
		if _, err := io.Copy(h, f); err != nil {
			f.Close()
			return err
		}
		f.Close()
		sum := hex.EncodeToString(h.Sum(nil))
		lines = append(lines, fmt.Sprintf("%s  %s", sum, entry.Name()))
	}

	sort.Strings(lines)
	checksumPath := filepath.Join(distDir, "checksums.txt")
	return os.WriteFile(checksumPath, []byte(strings.Join(lines, "\n")+"\n"), 0644)
}

func checkBinarySizeLimits(rootDir string) error {
	fmt.Println("📏 Checking binary size limits (26MB limit)...")
	distDir := filepath.Join(rootDir, ".dist")

	entries, err := os.ReadDir(distDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || (!strings.HasSuffix(entry.Name(), ".tar.gz") && entry.Name() != "dotfiles") {
			continue
		}
		filePath := filepath.Join(distDir, entry.Name())
		info, err := os.Stat(filePath)
		if err != nil {
			return fmt.Errorf("failed to stat file %s: %w", entry.Name(), err)
		}
		if info.Size() > maxBinarySizeBytes {
			mb := float64(info.Size()) / (1024.0 * 1024.0)
			return fmt.Errorf("file %s size (%.2f MB) exceeds limit of 26 MB", entry.Name(), mb)
		}
		mb := float64(info.Size()) / (1024.0 * 1024.0)
		fmt.Printf("  - %s: %.2f MB (OK)\n", entry.Name(), mb)
	}

	fmt.Println("✅ All release archives are within the 26MB size budget!")
	return nil
}

func buildTarget(rootDir, version, goos, goarch, outputPath string) error {
	fmt.Printf("🔨 Compiling Go binary for %s/%s -> %s\n", goos, goarch, outputPath)
	ldflags := fmt.Sprintf("-s -w -X main.Version=%s", version)
	cmd := exec.Command("go", "build", "-ldflags="+ldflags, "-o", outputPath, "./cmd/dotfiles")
	cmd.Dir = rootDir
	cmd.Env = append(os.Environ(),
		"GOOS="+goos,
		"GOARCH="+goarch,
		"CGO_ENABLED=0",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to compile for %s/%s: %w", goos, goarch, err)
	}
	return nil
}

func buildNative(rootDir, version string) error {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	binaryName := "dotfiles"
	if goos == "windows" {
		binaryName = "dotfiles.exe"
	}
	outputPath := filepath.Join(rootDir, ".dist", binaryName)
	fmt.Printf("🔨 Compiling native Go binary for current system (%s/%s) -> %s\n", goos, goarch, outputPath)
	ldflags := fmt.Sprintf("-s -w -X main.Version=%s", version)
	cmd := exec.Command("go", "build", "-ldflags="+ldflags, "-o", outputPath, "./cmd/dotfiles")
	cmd.Dir = rootDir
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to compile native binary: %w", err)
	}
	return nil
}

func compileAllBinaries(rootDir string) error {
	rootPkgPath := filepath.Join(rootDir, "package.json")
	rootBytes, err := os.ReadFile(rootPkgPath)
	if err != nil {
		return fmt.Errorf("failed to read root package.json: %w", err)
	}

	var rootPkg RootPackageJson
	if err := json.Unmarshal(rootBytes, &rootPkg); err != nil {
		return fmt.Errorf("failed to parse root package.json: %w", err)
	}
	version := rootPkg.Version

	distDir := filepath.Join(rootDir, ".dist")
	tmpBinDir := filepath.Join(rootDir, ".tmp", "release-bins")
	_ = os.RemoveAll(tmpBinDir)
	if err := os.MkdirAll(tmpBinDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(tmpBinDir)

	targets := []struct {
		goos   string
		goarch string
	}{
		{goos: "darwin", goarch: "amd64"},
		{goos: "darwin", goarch: "arm64"},
		{goos: "linux", goarch: "amd64"},
		{goos: "linux", goarch: "arm64"},
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(targets))

	for _, target := range targets {
		wg.Add(1)
		go func(t struct{ goos, goarch string }) {
			defer wg.Done()
			binName := "dotfiles"
			tmpBinPath := filepath.Join(tmpBinDir, fmt.Sprintf("dotfiles_%s_%s", t.goos, t.goarch))
			if err := buildTarget(rootDir, version, t.goos, t.goarch, tmpBinPath); err != nil {
				errCh <- err
				return
			}

			// If target matches current platform, copy to dist root binary
			if t.goos == runtime.GOOS && t.goarch == runtime.GOARCH {
				nativeDistBin := filepath.Join(distDir, binName)
				if err := copyFile(tmpBinPath, nativeDistBin); err != nil {
					errCh <- fmt.Errorf("failed to copy native binary to dist: %w", err)
					return
				}
				_ = os.Chmod(nativeDistBin, 0755)
			}

			tarName := fmt.Sprintf("dotfiles_%s_%s_%s.tar.gz", version, t.goos, t.goarch)
			tarPath := filepath.Join(distDir, tarName)

			archiveFiles := map[string]string{
				binName: tmpBinPath,
			}
			if _, err := os.Stat(filepath.Join(rootDir, "README.md")); err == nil {
				archiveFiles["README.md"] = filepath.Join(rootDir, "README.md")
			}
			if _, err := os.Stat(filepath.Join(rootDir, "LICENSE")); err == nil {
				archiveFiles["LICENSE"] = filepath.Join(rootDir, "LICENSE")
			}

			fmt.Printf("📦 Packaging release archive -> %s\n", tarPath)
			if err := createTarGz(tarPath, archiveFiles); err != nil {
				errCh <- fmt.Errorf("failed to package archive %s: %w", tarName, err)
				return
			}
		}(target)
	}

	wg.Wait()
	close(errCh)
	if err := <-errCh; err != nil {
		return err
	}

	if err := generateChecksums(distDir); err != nil {
		return fmt.Errorf("failed to generate checksums: %w", err)
	}

	return nil
}

func printBuildSummary(rootDir string) error {
	fmt.Println("✅ Build completed successfully!")
	distDir := filepath.Join(rootDir, ".dist")
	fmt.Printf("📁 Output directory: %s\n", distDir)
	fmt.Println("🗂️  Generated files:")

	err := filepath.WalkDir(distDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(rootDir, path)
		if err != nil {
			return err
		}
		kb := float64(info.Size()) / 1024.0
		fmt.Printf("  - %s (%.2f KB)\n", rel, kb)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to print build summary: %w", err)
	}
	return nil
}

// generateEmbeddedAssets produces everything the Go packages embed: the dashboard
// bundle, the generated TypeScript types, and the skill content. A checkout has none
// of these, so they must exist before the Go toolchain can build, vet or test.
func generateEmbeddedAssets(rootDir string) error {
	if err := cleanPreviousBuild(rootDir); err != nil {
		return fmt.Errorf("cleaning: %w", err)
	}

	if err := buildDashboard(rootDir); err != nil {
		return fmt.Errorf("building dashboard: %w", err)
	}

	if err := runTypegen(rootDir); err != nil {
		return fmt.Errorf("running typegen: %w", err)
	}

	if err := generateSchemaTypes(rootDir); err != nil {
		return fmt.Errorf("generating schema types: %w", err)
	}

	if err := copyAssetsAndSkill(rootDir); err != nil {
		return fmt.Errorf("copying assets and skill: %w", err)
	}

	return nil
}

func runBuild() error {
	rootDir, err := getRepoRoot()
	if err != nil {
		return fmt.Errorf("resolving repo root: %w", err)
	}

	if err := generateEmbeddedAssets(rootDir); err != nil {
		return err
	}

	if err := compileAllBinaries(rootDir); err != nil {
		return fmt.Errorf("compiling binaries: %w", err)
	}

	if err := checkBinarySizeLimits(rootDir); err != nil {
		return fmt.Errorf("checking binary size limits: %w", err)
	}

	if err := printBuildSummary(rootDir); err != nil {
		return fmt.Errorf("printing build summary: %w", err)
	}

	return nil
}

func main() {
	// --assets-only stops after generating embedded assets, skipping the cross-platform
	// binary build. It is what checks and tests need from a fresh checkout.
	assetsOnly := flag.Bool("assets-only", false, "generate embedded assets without compiling binaries")
	// --type-tests runs the tsd suite under tests/type-tests against the declarations
	// already generated in .dist, so the suite can be part of a check without a
	// cross-platform binary build.
	typeTestsOnly := flag.Bool("type-tests", false, "run the tsd type tests against the generated declarations")
	flag.Parse()

	run := runBuild
	if *assetsOnly {
		run = func() error {
			rootDir, err := getRepoRoot()
			if err != nil {
				return fmt.Errorf("resolving repo root: %w", err)
			}
			return generateEmbeddedAssets(rootDir)
		}
	}
	if *typeTestsOnly {
		run = func() error {
			rootDir, err := getRepoRoot()
			if err != nil {
				return fmt.Errorf("resolving repo root: %w", err)
			}
			return runTypeTests(rootDir)
		}
	}

	if err := run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
