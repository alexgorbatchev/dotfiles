# Shell Completions

Tab completions are configured per shell with `.completions()`, which takes either a
path to a completion file or a configuration object:

```typescript builder
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions({ cmd: 'tool completion bash' }))
```

`.completions()` is the only supported way to install a completion file. Do not write
one from a `.once()` script: a once script runs at the next shell start, long after the
file would have had to exist, and it has to hand-roll the output path that this method
already knows.

## Configuration Options

| Property | Description                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------- |
| `source` | Existing completion file. A relative path resolves against the tool's directory; absolute is used as is |
| `cmd`    | Command whose standard output becomes the completion file                                               |
| `bin`    | Binary the completion is for, when it differs from the tool name. It names the generated file           |

Pass one of `source` or `cmd`, never both: `source` is ignored when `cmd` is set. A
plain string is shorthand for `{ source }`.

## Lifecycle

Both `dotfiles generate` and a successful `dotfiles install <tool>` write the tool's
completion files. The difference is what each can produce:

- A `source` completion is a file that already exists, so it is linked into place as
  soon as `dotfiles generate` runs.
- A `cmd` completion has to run the installed binary, so before the tool is installed
  there is nothing to run: the command is skipped with a debug message, and the file
  appears the first time the tool installs successfully.

A completion file that is already in place is not regenerated; pass `--overwrite` to
`dotfiles generate` to replace it.

## Where the File Goes

The file is written to `<shellScriptsDir>/<shell>/completions/`, named `_<bin>` for zsh
and `<bin>` for bash, where `<bin>` is `bin` if given, otherwise the tool's first
`.bin()` name, otherwise the tool name.

The generated `main.zsh` adds the zsh directory to `fpath`, so zsh completions load on
the next shell start; reload the current shell with `autoload -U compinit && compinit`.

Files are produced for zsh and bash only, and only zsh loads them automatically: the
generated `main.bash` does not source the bash directory, and a `.completions()` call
inside `.powershell()` produces no file at all.

## Shell Callback Context

The shell callback receives the shell configurator for setting up completions, aliases, etc.
For context properties (`toolDir`, `currentDir`, `projectConfig`, etc.), use the outer `ctx` from `defineTool`.

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) => shell.completions("completions/_tool.zsh")),
);
```

## Static Completions (source)

For a completion file that already exists, either shipped next to the `.tool.ts` or
unpacked from the tool's own archive:

```typescript builder
// Next to the .tool.ts file: a relative path resolves against the tool's directory
.zsh((shell) => shell.completions('completions/_tool.zsh'))

// Inside the installed tree: build an absolute path from ctx
.zsh((shell) => shell.completions(`${ctx.currentDir}/complete/_tool`))
```

The path is taken literally -- it is not a glob. When the file sits in a directory
whose name varies with the version, resolve it with
[`ctx.resolve()`](utilities.md#ctxresolve), which matches a glob against exactly one
path.

A file that exists at neither path when the completions are written is skipped in
silence, so a completion the tool does not ship has to be produced first: fetch or
generate it in an `after-install` hook with `$`, then name the resulting path here.

## Dynamic Completions (cmd)

For a tool that prints its own completion script. This is the way to handle completions
that depend on the installed version, because the command runs against the binary that
was installed:

```typescript builder
.zsh((shell) => shell.completions({ cmd: 'tool completion zsh' }))
.bash((shell) => shell.completions({ cmd: 'tool completion bash' }))
```

The first word of `cmd` is resolved against this tool's own installed binaries -- the
`current` directory and the binary paths recorded for the tool -- and never against
PATH, so it can never run a shim, an older copy or an unrelated program of the same
name. A command whose first word is not one of this tool's binaries therefore cannot be
used here: run it from an `after-install` hook instead and pass the file it wrote as
`source`.

If the command fails or takes too long, the failure is reported as a warning and no
completion file is written; the rest of the installation still succeeds.

## Binary Name Override

When tool filename differs from binary name (e.g., `curl-script--fnm.tool.ts` for binary `fnm`):

```typescript builder
.zsh((shell) => shell.completions({
  cmd: 'fnm completions --shell zsh',
  bin: 'fnm'  // Results in '_fnm' instead of '_curl-script--fnm'
}))
```

## CLI Completions

`dotfiles generate` writes the CLI's own zsh completion to `<shellScriptsDir>/zsh/completions/_dotfiles` (`shellScriptsDir` defaults to `<generatedDir>/shell-scripts`). The generated `main.zsh` already adds that directory to `fpath`, so the tool configuration that installs the CLI (`dotfiles.tool.ts`) needs no `.completions()` entry, and one that runs `dotfiles completion zsh` only rewrites the same file.

The file is tracked under the `system` pseudo-tool like `main.zsh`, so per-tool stale cleanup never removes it. It is safe to autoload from `fpath`: its file-scope `compdef _dotfiles dotfiles` runs once when zsh first loads the function, and its trailing `$funcstack` guard skips completion on that load, so no `source` or `compdef` line is needed anywhere.

Reload completions after running `dotfiles generate`:

```bash
autoload -U compinit && compinit
```

Subcommands that take a tool name (`install`, `update`, `uninstall`, `why`, `files`, `log`, `validate`) complete it from the configured tools, so `dotfiles install <Tab>` lists tool names rather than files. `bin` also offers the configured binary names. The candidates come from the configuration the CLI would run with, so `--config` on the command line is honoured.
