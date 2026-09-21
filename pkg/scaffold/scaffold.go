// Package scaffold provisions the starter tool configurations a dotfiles
// repository is expected to have. Provisioning is an explicit, user-invoked
// operation: loading a configuration never creates these files.
package scaffold

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/backup"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// legacyProjectTSConfig is the tsconfig.json this project wrote into a repository that
// had none, before the CLI owned a tsconfig under the generated directory. A file
// matching it byte for byte was never edited by the user, so replacing it loses nothing.
const legacyProjectTSConfig = "{\n  \"compilerOptions\": {\n    \"target\": \"ESNext\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"strict\": true,\n    \"noEmit\": true,\n    \"skipLibCheck\": true,\n    \"lib\": [\n      \"ESNext\"\n    ]\n  },\n  \"include\": [\n    \"dotfiles.config.ts\",\n    \"tools/**/*.ts\"\n  ]\n}\n"

type projectTSConfig struct {
	Extends string `json:"extends"`
}

// ProjectTSConfig renders the tsconfig.json a project is given when it has none. It
// only extends the tsconfig the CLI writes under the generated directory, so an editor
// checks tool configurations with the same program `dotfiles tool validate` runs; the
// argument is that file's path relative to the project's tsconfig.
func ProjectTSConfig(generatedTSConfig string) ([]byte, error) {
	out, err := json.MarshalIndent(projectTSConfig{Extends: filepath.ToSlash(generatedTSConfig)}, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding project tsconfig: %w", err)
	}
	return append(out, '\n'), nil
}

// IsLegacyProjectTSConfig reports whether content is exactly the tsconfig.json an
// earlier version of this project generated, and so can be replaced without losing
// anything the user wrote.
func IsLegacyProjectTSConfig(content []byte) bool {
	return string(content) == legacyProjectTSConfig
}

// Action describes what happened to a single starter tool configuration.
type Action string

const (
	// ActionCreated means the file did not exist and was written.
	ActionCreated Action = "created"
	// ActionOverwrote means an existing file was replaced because Force was set.
	ActionOverwrote Action = "overwrote"
	// ActionSkipped means an existing file was left untouched.
	ActionSkipped Action = "skipped"
	// ActionOutdated means an existing file is an older version this project generated
	// and was left untouched because Force was not set.
	ActionOutdated Action = "outdated"
)

// Result records what happened to one starter tool configuration.
type Result struct {
	Path   string
	Action Action
	// BackupPath is set when a file the user had edited was preserved beside itself
	// before being replaced.
	BackupPath string
}

// Options configures a scaffolding run.
type Options struct {
	// Dir is the tool configurations directory to provision into.
	Dir string
	// TargetOS selects platform-specific templates, using runtime.GOOS values.
	TargetOS string
	// Force replaces existing files instead of leaving them untouched.
	Force bool
}

type template struct {
	name    string
	content string
	// targetOS restricts the template to a single platform. Empty means every platform.
	targetOS string
}

const dotfilesToolContent = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "alexgorbatchev/dotfiles" })
    .bin("dotfiles"),
);
`

// brewInstallScript is the official Homebrew installer invocation, run before the
// binary is located so a machine without Homebrew provisions it first.
const brewInstallScript = "INTERACTIVE=1 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""

// brewToolContent declares Homebrew once per macOS architecture because its install
// prefix differs between them: /opt/homebrew on Apple Silicon and /usr/local on Intel
// (https://docs.brew.sh/Installation). Both are released targets, so both are declared.
const brewToolContent = `import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install()
    .platform(Platform.MacOS, Architecture.Arm64, (install) =>
      install("manual", {
        binaryPath: "/opt/homebrew/bin/brew",
        symlink: true,
      })
        .hook("before-install", async ({ $ }) => {
          await $` + "`" + brewInstallScript + "`" + `;
        })
        .zsh((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"'))
        .bash((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"')),
    )
    .platform(Platform.MacOS, Architecture.X86_64, (install) =>
      install("manual", {
        binaryPath: "/usr/local/bin/brew",
        symlink: true,
      })
        .hook("before-install", async ({ $ }) => {
          await $` + "`" + brewInstallScript + "`" + `;
        })
        .zsh((shell) => shell.always('eval "$(/usr/local/bin/brew shellenv)"'))
        .bash((shell) => shell.always('eval "$(/usr/local/bin/brew shellenv)"')),
    ),
);
`

// typescriptReleaseTag pins the TypeScript 7 release the declarations the CLI emits are
// written against. The repository also publishes unrelated tags (a vsix pre-release),
// so "latest" is not a safe choice.
const typescriptReleaseTag = "typescript/v7.0.2"

// typescriptToolContent installs the native TypeScript compiler `dotfiles tool validate`
// type-checks tool configurations with. It is declared without a shim on purpose: the
// generated bin directory is on PATH, and a TypeScript 7 `tsc` there would shadow the
// TypeScript other projects on the machine install for themselves. `validate` reaches
// the compiler through the tool's current directory instead.
const typescriptToolContent = `import { defineTool } from "@alexgorbatchev/dotfiles";

// The TypeScript compiler that "dotfiles tool validate" type-checks tool configurations
// with. It has no shim, so it never shadows another project's TypeScript on PATH;
// "dotfiles tool validate" runs it from this tool's current directory.
export default defineTool((install) =>
  install("github-release", {
    repo: "microsoft/typescript-go",
    version: "` + typescriptReleaseTag + `",
  }).bin("tsc", { shim: false }),
);
`

// legacyBrewToolContent is the brew template this project generated before Homebrew's
// Intel prefix was accounted for. A file matching it byte for byte was never edited by
// the user, so replacing it loses nothing.
const legacyBrewToolContent = `import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("manual", {
      binaryPath: "/opt/homebrew/bin/brew",
      symlink: true,
    })
      .hook("before-install", async ({ $ }) => {
        await $` + "`" + `INTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` + "`" + `;
      })
      .zsh((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"'))
      .bash((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"')),
  ),
);
`

// legacyContents lists, per template, the exact contents this project generated in the
// past. It is how an untouched but outdated file is told apart from one the user wrote.
var legacyContents = map[string][]string{
	"brew.tool.ts": {legacyBrewToolContent},
}

// Templates are provisioned in this order, which is the order results are reported.
var templates = []template{
	{name: "dotfiles.tool.ts", content: dotfilesToolContent},
	// `dotfiles tool validate` type-checks tool configurations with this compiler on every
	// platform.
	{name: "typescript.tool.ts", content: typescriptToolContent},
	// Homebrew underpins the other macOS installers, so a macOS repository is expected
	// to define it.
	{name: "brew.tool.ts", content: brewToolContent, targetOS: "darwin"},
}

// Run provisions the starter tool configurations for opts.TargetOS into opts.Dir,
// creating the directory when it does not exist. Existing files are reported as
// skipped and left untouched unless opts.Force is set.
func Run(fsys fs.FS, opts Options) ([]Result, error) {
	if opts.Dir == "" {
		return nil, fmt.Errorf("tool configs directory is required")
	}
	if err := fsys.MkdirAll(opts.Dir, 0755); err != nil {
		return nil, fmt.Errorf("creating tool configs directory %q: %w", opts.Dir, err)
	}

	var results []Result
	for _, t := range templates {
		if t.targetOS != "" && t.targetOS != opts.TargetOS {
			continue
		}

		path := filepath.Join(opts.Dir, t.name)
		exists, err := fsys.Exists(path)
		if err != nil {
			return nil, fmt.Errorf("checking %q: %w", path, err)
		}

		var existing []byte
		if exists {
			if existing, err = fsys.ReadFile(path); err != nil {
				return nil, fmt.Errorf("reading %q: %w", path, err)
			}
			if string(existing) == t.content {
				results = append(results, Result{Path: path, Action: ActionSkipped})
				continue
			}
			if !opts.Force {
				// An untouched copy of an older template is reported separately, so the
				// difference between "you edited this" and "this is out of date" is
				// visible without ever overwriting anything.
				action := ActionSkipped
				if isLegacyContent(t.name, existing) {
					action = ActionOutdated
				}
				results = append(results, Result{Path: path, Action: action})
				continue
			}
		}

		result := Result{Path: path, Action: ActionCreated}
		if exists {
			result.Action = ActionOverwrote
			// Only the user's own edits are worth preserving; a copy this project
			// generated can be reproduced from the template.
			if !isLegacyContent(t.name, existing) {
				// A free name rather than a fixed one, so scaffolding twice does not
				// overwrite the copy of the file the user actually wrote.
				reserved, err := backup.Reserve(fsys, path)
				if err != nil {
					return nil, fmt.Errorf("backing up %q: %w", path, err)
				}
				result.BackupPath = reserved
				if err := fsys.WriteFile(result.BackupPath, existing, 0644); err != nil {
					return nil, fmt.Errorf("backing up %q: %w", path, err)
				}
			}
		}

		if err := fsys.WriteFile(path, []byte(t.content), 0644); err != nil {
			return nil, fmt.Errorf("writing %q: %w", path, err)
		}
		results = append(results, result)
	}

	return results, nil
}

// isLegacyContent reports whether content is exactly something this project generated
// for the named template in an earlier version.
func isLegacyContent(name string, content []byte) bool {
	for _, legacy := range legacyContents[name] {
		if string(content) == legacy {
			return true
		}
	}
	return false
}
