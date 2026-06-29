package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type RootPackageJson struct {
	Version string `json:"version"`
}

func getRepoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(cwd, "go.mod")); err == nil {
		return cwd, nil
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

	loaderApiPath := filepath.Join(rootDir, "pkg/vm/loader-api.ts")
	loaderBytes, err := os.ReadFile(loaderApiPath)
	if err != nil {
		return fmt.Errorf("failed to read loader-api.ts: %w", err)
	}
	loaderApiContent := string(loaderBytes)

	loaderApiDeclMap := []string{
		"export type ShellStrings = TemplateStringsArray | string;",
		"export type PlatformCallback = (install: (method: string, params?: unknown) => IToolBuilder) => void;",
		"export type ArchCallback = (install: (method: string, params?: unknown) => IToolBuilder) => void;",
		"export type ShellCallback = (shell: Record<string, unknown>) => void;",
	}

	interfacesToExtract := []string{"IToolBuilder", "IShellConfigs", "IPathModule"}
	for _, iface := range interfacesToExtract {
		pattern := fmt.Sprintf("export interface %s \\{[\\s\\S]*?\\n\\}", iface)
		re := regexp.MustCompile(pattern)
		match := re.FindString(loaderApiContent)
		if match != "" {
			loaderApiDeclMap = append(loaderApiDeclMap, match)
		} else {
			return fmt.Errorf("failed to extract interface %s from loader-api.ts", iface)
		}
	}

	publicDeclarationsTemplate := strings.Join([]string{
		"import { ZodError, z } from 'zod';",
		"export declare function dedentString(str: string): string;",
		"export declare function dedentTemplate(template: string, values: Record<string, string>): string;",
		dslTypesContent,
		strings.Join(loaderApiDeclMap, "\n\n"),
		"export declare function defineConfig(callback: ConfigFactory): ConfigFactory;",
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
		"\tISystemInfoInternal as z_internal_ISystemInfo,",
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

	schemasDtsContent := strings.Join([]string{
		"// Generated types for @alexgorbatchev/dotfiles",
		publicDeclarationsTemplate,
		cleanedGeneratedTypes,
	}, "\n\n")

	if err := os.WriteFile(filepath.Join(distDir, "schemas.d.ts"), []byte(schemasDtsContent), 0644); err != nil {
		return fmt.Errorf("failed to write schemas.d.ts: %w", err)
	}

	if err := os.WriteFile(filepath.Join(distDir, "tool-types.d.ts"), []byte(schemasDtsContent), 0644); err != nil {
		return fmt.Errorf("failed to write tool-types.d.ts: %w", err)
	}

	combinedBody := strings.Join([]string{publicDeclarationsTemplate, cleanedGeneratedTypes}, "\n\n")
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

	if err := os.WriteFile(filepath.Join(distDir, "authoring-types.d.ts"), []byte(authoringTypesDtsContent), 0644); err != nil {
		return fmt.Errorf("failed to write authoring-types.d.ts: %w", err)
	}

	if err := os.WriteFile(filepath.Join(distDir, "cli.d.ts"), []byte(authoringTypesDtsContent), 0644); err != nil {
		return fmt.Errorf("failed to write cli.d.ts: %w", err)
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
		"types": "./schemas.d.ts",
		"exports": map[string]interface{}{
			".": map[string]interface{}{
				"import": map[string]string{
					"types":   "./schemas.d.ts",
					"default": "./cli.js",
				},
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

export const Platform = Object.freeze({ None: 0, Linux: 1, MacOS: 2, Windows: 4, Unix: 3, All: 7 });
export const Architecture = Object.freeze({ None: 0, X86_64: 1, Arm64: 2, All: 3 });
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

func copyAssetsAndSkill(rootDir string) error {
	fmt.Println("📚 Copying skill and public assets...")
	distDir := filepath.Join(rootDir, ".dist")

	assets := []string{"README.md", "LICENSE"}
	for _, asset := range assets {
		src := filepath.Join(rootDir, asset)
		dst := filepath.Join(distDir, asset)
		if _, err := os.Stat(src); err == nil {
			srcFile, err := os.Open(src)
			if err != nil {
				return fmt.Errorf("failed to open asset %s: %w", asset, err)
			}
			defer srcFile.Close()
			dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
			if err != nil {
				return fmt.Errorf("failed to create asset %s: %w", asset, err)
			}
			defer dstFile.Close()
			if _, err := io.Copy(dstFile, srcFile); err != nil {
				return fmt.Errorf("failed to copy asset %s: %w", asset, err)
			}
		}
	}

	skillSrc := filepath.Join(rootDir, ".agents", "skills", "dotfiles")
	skillDst := filepath.Join(distDir, "skill")
	if _, err := os.Stat(skillSrc); err == nil {
		if err := copyDirectoryRecursive(skillSrc, skillDst); err != nil {
			return fmt.Errorf("failed to copy skill directory: %w", err)
		}
	}
	return nil
}

func buildTarget(rootDir, goos, goarch, outputPath string) error {
	fmt.Printf("🔨 Compiling Go binary for %s/%s -> %s\n", goos, goarch, outputPath)
	cmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", outputPath, "./cmd/dotfiles")
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

func buildNative(rootDir string) error {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	binaryName := "dotfiles"
	if goos == "windows" {
		binaryName = "dotfiles.exe"
	}
	outputPath := filepath.Join(rootDir, ".dist", binaryName)
	fmt.Printf("🔨 Compiling native Go binary for current system (%s/%s) -> %s\n", goos, goarch, outputPath)
	cmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", outputPath, "./cmd/dotfiles")
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
	if err := buildNative(rootDir); err != nil {
		return err
	}

	targets := []struct {
		goos   string
		goarch string
		pkgDir string
	}{
		{goos: "darwin", goarch: "amd64", pkgDir: "alexgorbatchev/dotfiles-darwin-x64"},
		{goos: "darwin", goarch: "arm64", pkgDir: "alexgorbatchev/dotfiles-darwin-arm64"},
		{goos: "linux", goarch: "amd64", pkgDir: "alexgorbatchev/dotfiles-linux-x64"},
		{goos: "linux", goarch: "arm64", pkgDir: "alexgorbatchev/dotfiles-linux-arm64"},
	}

	for _, target := range targets {
		outputPath := filepath.Join(rootDir, ".dist", "packages", target.pkgDir, "bin", "dotfiles")
		if err := buildTarget(rootDir, target.goos, target.goarch, outputPath); err != nil {
			return err
		}
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

func main() {
	rootDir, err := getRepoRoot()
	if err != nil {
		fmt.Printf("Error resolving repo root: %v\n", err)
		os.Exit(1)
	}

	if err := cleanPreviousBuild(rootDir); err != nil {
		fmt.Printf("Error cleaning: %v\n", err)
		os.Exit(1)
	}

	if err := buildDashboard(rootDir); err != nil {
		fmt.Printf("Error building dashboard: %v\n", err)
		os.Exit(1)
	}

	if err := runTypegen(rootDir); err != nil {
		fmt.Printf("Error running typegen: %v\n", err)
		os.Exit(1)
	}

	if err := generateSchemaTypes(rootDir); err != nil {
		fmt.Printf("Error generating schema types: %v\n", err)
		os.Exit(1)
	}

	if _, err := generatePackageJsons(rootDir); err != nil {
		fmt.Printf("Error generating package.jsons: %v\n", err)
		os.Exit(1)
	}

	if err := writeLauncher(rootDir); err != nil {
		fmt.Printf("Error writing launcher: %v\n", err)
		os.Exit(1)
	}

	if err := copyAssetsAndSkill(rootDir); err != nil {
		fmt.Printf("Error copying assets and skill: %v\n", err)
		os.Exit(1)
	}

	if err := compileAllBinaries(rootDir); err != nil {
		fmt.Printf("Error compiling binaries: %v\n", err)
		os.Exit(1)
	}

	if err := printBuildSummary(rootDir); err != nil {
		fmt.Printf("Error printing build summary: %v\n", err)
		os.Exit(1)
	}
}
