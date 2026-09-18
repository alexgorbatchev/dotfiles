# Shell Completions

Tab completions are configured per-shell using `.completions()`:

```typescript builder
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
```

> **Lifecycle**: All completions are generated only after `dotfiles install <tool>` succeeds,
> not during `dotfiles generate`. This ensures cmd-based completions can execute the installed
> binary.

## Configuration Options

| Property | Description                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| `source` | Path to completion file (relative to toolDir, or absolute path within extracted archive) |
| `cmd`    | Command to generate completions dynamically                                              |
| `bin`    | Binary name for completion filename (when different from tool name)                      |

**Note**: Use one of these combinations:

- `'_tool.zsh'` - String path (relative to toolDir or absolute)
- `{ source }` - Static file (relative to toolDir or absolute)
- `{ cmd }` - Generate dynamically by running the installed binary

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

For completion files bundled in tool archives:

```typescript builder
// Simple path relative to extracted archive
.zsh((shell) => shell.completions('completions/_tool.zsh'))

// Glob pattern for versioned directories
.zsh((shell) => shell.completions('*/complete/_rg'))
```

**Supported glob patterns**: `*`, `**`, `?`, `[abc]`

A completion file that must be fetched from elsewhere is downloaded in an `after-install`
hook with `$`, then referenced here by its path under `ctx.currentDir`.

## Dynamic Completions (cmd)

For tools that generate completions at runtime (recommended for version-dependent completions, since the command runs against the installed binary):

```typescript builder
.zsh((shell) => shell.completions({ cmd: 'tool completion zsh' }))
.bash((shell) => shell.completions({ cmd: 'tool completion bash' }))
```

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
