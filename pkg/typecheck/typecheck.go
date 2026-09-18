// Package typecheck owns the TypeScript program the CLI type-checks tool
// configurations with: the tsconfig it writes under the generated directory and the
// diagnostics it reads back from the compiler.
package typecheck

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// PackageName is the authoring package tool configurations import from.
const PackageName = "@alexgorbatchev/dotfiles"

// legacyPackageName is the older import specifier index.d.ts still declares.
const legacyPackageName = "@dotfiles/cli"

// TSConfigFileName is the name of the tsconfig the CLI writes.
const TSConfigFileName = "tsconfig.json"

// RegistryFileName is the name of the generated bin-name registry.
const RegistryFileName = "tool-types.d.ts"

// TSConfigPath is where the CLI-owned tsconfig lives for a generated directory.
func TSConfigPath(generatedDir string) string {
	return filepath.Join(generatedDir, TSConfigFileName)
}

// Program describes the files a project's tool configurations are type-checked with.
// Every path is absolute; the tsconfig is written with paths relative to Dir so the
// generated directory can move with the project.
type Program struct {
	// Dir is the directory the tsconfig is written into.
	Dir string
	// ConfigFile is the project configuration file (dotfiles.config.ts). Empty when the
	// project is configured with JSON, which needs no type-checking.
	ConfigFile string
	// ToolConfigsDirs hold the *.tool.ts files.
	ToolConfigsDirs []string
	// DeclarationsDir holds the authoring package: index.d.ts and globals.d.ts.
	DeclarationsDir string
	// RegistryFile is the generated bin-name registry (tool-types.d.ts). Empty when
	// there is none.
	RegistryFile string
}

type compilerOptions struct {
	Target                     string              `json:"target"`
	Module                     string              `json:"module"`
	ModuleResolution           string              `json:"moduleResolution"`
	Lib                        []string            `json:"lib"`
	Types                      []string            `json:"types"`
	Strict                     bool                `json:"strict"`
	NoEmit                     bool                `json:"noEmit"`
	SkipLibCheck               bool                `json:"skipLibCheck"`
	AllowImportingTsExtensions bool                `json:"allowImportingTsExtensions"`
	Paths                      map[string][]string `json:"paths"`
}

type tsconfig struct {
	CompilerOptions compilerOptions `json:"compilerOptions"`
	Include         []string        `json:"include"`
}

// TSConfig renders the tsconfig for the program.
//
// The options are the ones the shipped declarations are written and tested against.
// `types` is empty on purpose: configurations run inside the CLI's embedded runtime,
// whose globals ship in globals.d.ts, so Node or Bun type definitions found in the
// project would only describe APIs that do not exist at run time.
func (p Program) TSConfig() ([]byte, error) {
	if p.Dir == "" {
		return nil, fmt.Errorf("program directory is required")
	}
	if p.DeclarationsDir == "" {
		return nil, fmt.Errorf("declarations directory is required")
	}

	index := p.relative(filepath.Join(p.DeclarationsDir, "index.d.ts"))
	include := []string{index, p.relative(filepath.Join(p.DeclarationsDir, "globals.d.ts"))}
	if p.ConfigFile != "" {
		include = append(include, p.relative(p.ConfigFile))
	}
	for _, dir := range p.ToolConfigsDirs {
		include = append(include, p.relative(dir)+"/**/*.ts")
	}
	if p.RegistryFile != "" {
		include = append(include, p.relative(p.RegistryFile))
	}

	cfg := tsconfig{
		CompilerOptions: compilerOptions{
			Target:                     "ESNext",
			Module:                     "ESNext",
			ModuleResolution:           "bundler",
			Lib:                        []string{"ESNext"},
			Types:                      []string{},
			Strict:                     true,
			NoEmit:                     true,
			SkipLibCheck:               true,
			AllowImportingTsExtensions: true,
			Paths: map[string][]string{
				PackageName:       {index},
				legacyPackageName: {index},
			},
		},
		Include: include,
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding tsconfig: %w", err)
	}
	return append(out, '\n'), nil
}

// relative expresses path relative to the program directory, in the forward-slash
// form tsconfig expects, falling back to the absolute path when no relative form
// exists (a different volume, for instance).
func (p Program) relative(path string) string {
	rel, err := filepath.Rel(p.Dir, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	rel = filepath.ToSlash(rel)
	if !strings.HasPrefix(rel, "../") && rel != ".." {
		rel = "./" + rel
	}
	return rel
}

// Diagnostic is one error the compiler reported.
type Diagnostic struct {
	// File is the path as the compiler printed it: relative to the working directory
	// the compiler ran in.
	File string
	// Line and Column are 1-based.
	Line   int
	Column int
	// Code is the TypeScript diagnostic code, e.g. "TS2339".
	Code string
	// Message is the full diagnostic text, including any continuation lines.
	Message string
}

// String renders the diagnostic the way the compiler does.
func (d Diagnostic) String() string {
	return fmt.Sprintf("%s(%d,%d): error %s: %s", d.File, d.Line, d.Column, d.Code, d.Message)
}

// Run type-checks the program described by the tsconfig at tsconfigPath with the
// compiler at compilerPath, running the compiler in dir so reported file paths are
// relative to it. It returns the diagnostics the compiler reported; a compiler that
// fails without reporting any is an error.
func Run(ctx context.Context, runner exec.CommandRunner, compilerPath, tsconfigPath, dir string) ([]Diagnostic, error) {
	cmd := runner.CommandContext(ctx, compilerPath, "--pretty", "false", "-p", tsconfigPath)
	cmd.SetDir(dir)

	var stdout, stderr bytes.Buffer
	cmd.SetStdout(&stdout)
	cmd.SetStderr(&stderr)

	runErr := cmd.Run()
	diagnostics := ParseDiagnostics(stdout.String())
	if runErr != nil && len(diagnostics) == 0 {
		return nil, fmt.Errorf("running %s: %w\n%s%s", compilerPath, runErr, stdout.String(), stderr.String())
	}
	return diagnostics, nil
}

// diagnosticLine matches the first line of a diagnostic in `--pretty false` output:
// path(line,col): error TS1234: message
var diagnosticLine = regexp.MustCompile(`^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$`)

// ParseDiagnostics reads the compiler's `--pretty false` output. A diagnostic may
// continue over indented lines, which are folded into its message.
func ParseDiagnostics(output string) []Diagnostic {
	var diagnostics []Diagnostic
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if m := diagnosticLine.FindStringSubmatch(trimmed); m != nil {
			lineNo, _ := strconv.Atoi(m[2])
			column, _ := strconv.Atoi(m[3])
			diagnostics = append(diagnostics, Diagnostic{
				File:    m[1],
				Line:    lineNo,
				Column:  column,
				Code:    m[4],
				Message: m[5],
			})
			continue
		}
		if len(diagnostics) > 0 && strings.HasPrefix(trimmed, " ") {
			last := &diagnostics[len(diagnostics)-1]
			last.Message += "\n" + trimmed
		}
	}
	return diagnostics
}
