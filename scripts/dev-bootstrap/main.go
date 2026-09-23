package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// defaultTargetDir is the dotfiles directory bootstrapped when none is given.
const defaultTargetDir = "~/.dotfiles"

// Options configures a dev-bootstrap run.
type Options struct {
	RepoRoot   string
	TargetDir  string
	DevBin     string
	SkipAssets bool
	Verbose    bool
	Stdout     io.Writer
	Stderr     io.Writer
}

func findRepoRootFrom(dir string) (string, error) {
	current := dir
	for {
		if _, err := os.Stat(filepath.Join(current, "go.mod")); err == nil {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return dir, nil
}

func getRepoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return findRepoRootFrom(cwd)
}

func getGitShortSHA(dir string) string {
	cmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	sha := strings.TrimSpace(string(out))
	if sha == "" {
		return "unknown"
	}
	return sha
}

func binName(base string) string {
	if runtime.GOOS == "windows" {
		return base + ".exe"
	}
	return base
}

// Run executes the dev-bootstrap pipeline.
func Run(opts Options) error {
	stdout := opts.Stdout
	if stdout == nil {
		stdout = os.Stdout
	}
	stderr := opts.Stderr
	if stderr == nil {
		stderr = os.Stderr
	}

	repoRoot := opts.RepoRoot
	if repoRoot == "" {
		var err error
		repoRoot, err = getRepoRoot()
		if err != nil {
			return fmt.Errorf("resolving repo root: %w", err)
		}
	}

	// Step 1: Refresh embedded assets
	if !opts.SkipAssets {
		fmt.Fprintln(stdout, "[dev-bootstrap] Refreshing embedded declaration assets...")
		refreshCmd := exec.Command("go", "run", "./scripts/build/main.go", "--assets-only")
		refreshCmd.Dir = repoRoot
		if out, err := refreshCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("refreshing embedded assets: %w\n%s", err, string(out))
		}
	}

	// Step 2: Compile host binary into temporary executable
	devBin := opts.DevBin
	if devBin == "" {
		fmt.Fprintf(stdout, "[dev-bootstrap] Compiling dev binary for %s/%s...\n", runtime.GOOS, runtime.GOARCH)
		tmpDir := filepath.Join(repoRoot, ".tmp")
		if err := os.MkdirAll(tmpDir, 0755); err != nil {
			return fmt.Errorf("creating .tmp directory: %w", err)
		}

		devBinName := binName("dotfiles-dev")
		devBin = filepath.Join(tmpDir, devBinName)

		shortSHA := getGitShortSHA(repoRoot)
		devVersion := fmt.Sprintf("999.0.0-dev.%s", shortSHA)
		ldflags := fmt.Sprintf("-s -w -X main.Version=%s", devVersion)

		compileCmd := exec.Command("go", "build", "-ldflags", ldflags, "-o", devBin, "./cmd/dotfiles")
		compileCmd.Dir = repoRoot
		if out, err := compileCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("compiling dev binary: %w\n%s", err, string(out))
		}
	}

	// Step 3: Resolve target paths and provision starter configurations if missing
	target := opts.TargetDir
	if target == "" {
		target = defaultTargetDir
	}
	if home, err := os.UserHomeDir(); err == nil {
		target = utils.ExpandHomePath(home, target)
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return fmt.Errorf("resolving target path: %w", err)
	}

	fmt.Fprintf(stdout, "[dev-bootstrap] Resolving target paths for %s...\n", absTarget)

	configPath := filepath.Join(absTarget, "dotfiles.config.ts")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		jsPath := filepath.Join(absTarget, "dotfiles.config.js")
		if _, err := os.Stat(jsPath); err == nil {
			configPath = jsPath
		} else {
			if err := os.MkdirAll(absTarget, 0755); err != nil {
				return fmt.Errorf("creating target directory %s: %w", absTarget, err)
			}

			pkgJsonPath := filepath.Join(absTarget, "package.json")
			if _, err := os.Stat(pkgJsonPath); os.IsNotExist(err) {
				pkgJSON := "{\n  \"private\": true,\n  \"type\": \"module\"\n}\n"
				if err := os.WriteFile(pkgJsonPath, []byte(pkgJSON), 0644); err != nil {
					return fmt.Errorf("writing package.json: %w", err)
				}
			}

			tsconfigPath := filepath.Join(absTarget, "tsconfig.json")
			if _, err := os.Stat(tsconfigPath); os.IsNotExist(err) {
				tsconfigJSON := "{\n  \"compilerOptions\": {\n    \"target\": \"ESNext\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"strict\": true,\n    \"noEmit\": true,\n    \"skipLibCheck\": true,\n    \"lib\": [\n      \"ESNext\"\n    ]\n  },\n  \"include\": [\n    \"dotfiles.config.ts\",\n    \"tools/**/*.ts\"\n  ]\n}\n"
				if err := os.WriteFile(tsconfigPath, []byte(tsconfigJSON), 0644); err != nil {
					return fmt.Errorf("writing tsconfig.json: %w", err)
				}
			}

			defaultConfig := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n\nexport default defineConfig(({ configFileDir }) => ({\n  paths: {\n    dotfilesDir: configFileDir,\n    toolConfigsDir: `${configFileDir}/tools`,\n    generatedDir: `${configFileDir}/.generated`,\n    targetDir: \"~\",\n  },\n}));\n"
			if err := os.WriteFile(configPath, []byte(defaultConfig), 0644); err != nil {
				return fmt.Errorf("writing starter dotfiles.config.ts: %w", err)
			}

			scaffoldCmd := exec.Command(devBin, "--config", configPath, "tool", "scaffold")
			if out, err := scaffoldCmd.CombinedOutput(); err != nil {
				return fmt.Errorf("scaffolding starter tools: %w\n%s", err, string(out))
			}
		}
	}

	pathCmd := exec.Command(devBin, "--config", configPath, "path", "get", "binaries")
	binariesOut, err := pathCmd.Output()
	if err != nil {
		return fmt.Errorf("resolving binaries directory: %w", err)
	}
	binariesDir := strings.TrimSpace(string(binariesOut))
	if binariesDir == "" {
		binariesDir = filepath.Join(absTarget, ".generated", "binaries")
	}

	// Step 4: Deploy local executable
	finalBinName := binName("dotfiles")
	destBin := filepath.Join(binariesDir, "dotfiles", "current", finalBinName)
	fmt.Fprintf(stdout, "[dev-bootstrap] Deploying binary to %s...\n", destBin)

	if err := os.MkdirAll(filepath.Dir(destBin), 0755); err != nil {
		return fmt.Errorf("creating destination directory %s: %w", filepath.Dir(destBin), err)
	}

	devBinData, err := os.ReadFile(devBin)
	if err != nil {
		return fmt.Errorf("reading compiled dev binary: %w", err)
	}

	_ = os.Remove(destBin)
	if err := os.WriteFile(destBin, devBinData, 0755); err != nil {
		return fmt.Errorf("writing deployed binary: %w", err)
	}

	// Step 5: Execute full generation
	fmt.Fprintln(stdout, "[dev-bootstrap] Running state generate...")
	generateCmd := exec.Command(destBin, "--config", configPath, "state", "generate")
	if opts.Verbose {
		generateCmd.Stdout = stdout
		generateCmd.Stderr = stderr
		if err := generateCmd.Run(); err != nil {
			return fmt.Errorf("running state generate: %w", err)
		}
	} else {
		if out, err := generateCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("running state generate: %w\n%s", err, string(out))
		}
	}

	fmt.Fprintf(stdout, "[dev-bootstrap] Successfully bootstrapped %s with local development build.\n", absTarget)
	return nil
}

// parseArgs turns the command line into the Options for Run. It is kept apart
// from Run so the command line can be tested without compiling the CLI and
// refreshing the embedded assets of the repository.
func parseArgs(args []string, stdout, stderr io.Writer) (Options, error) {
	flags := flag.NewFlagSet("dev-bootstrap", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() {
		fmt.Fprintf(stderr, "Usage: dev-bootstrap [-v] [target]\n\nDeploys a local development build into target (default %s).\n\n", defaultTargetDir)
		flags.PrintDefaults()
	}

	var verbose bool
	flags.BoolVar(&verbose, "v", false, "verbose output")
	flags.BoolVar(&verbose, "verbose", false, "verbose output")

	if err := flags.Parse(args); err != nil {
		return Options{}, err
	}

	// A second positional argument would otherwise be dropped silently while
	// the first one is bootstrapped.
	if flags.NArg() > 1 {
		flags.Usage()
		// Parse consumes a "--" that ends the flags; everything after it is
		// positional on purpose.
		consumed := len(args) - flags.NArg()
		terminated := consumed > 0 && args[consumed-1] == "--"
		quoted := make([]string, flags.NArg())
		for i, arg := range flags.Args() {
			// Parsing stops at the first positional argument, so a flag
			// written after the target arrives here as another argument.
			if i > 0 && !terminated && isDefinedFlag(flags, arg) {
				return Options{}, fmt.Errorf("flag %s must come before the target directory", arg)
			}
			quoted[i] = strconv.Quote(arg)
		}
		return Options{}, fmt.Errorf("expected at most one target directory, got %d: %s", flags.NArg(), strings.Join(quoted, " "))
	}

	// An absent target stays empty; Run applies defaultTargetDir.
	return Options{
		TargetDir: flags.Arg(0),
		Verbose:   verbose,
		Stdout:    stdout,
		Stderr:    stderr,
	}, nil
}

// isDefinedFlag reports whether arg names a flag defined on flags, written as
// -name, --name or -name=value.
func isDefinedFlag(flags *flag.FlagSet, arg string) bool {
	name, ok := strings.CutPrefix(arg, "-")
	if !ok {
		return false
	}
	name = strings.TrimPrefix(name, "-")
	name, _, _ = strings.Cut(name, "=")
	return name != "" && flags.Lookup(name) != nil
}

func runMain(args []string, stdout, stderr io.Writer) error {
	opts, err := parseArgs(args, stdout, stderr)
	if err != nil {
		return err
	}
	return Run(opts)
}

func main() {
	if err := runMain(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
