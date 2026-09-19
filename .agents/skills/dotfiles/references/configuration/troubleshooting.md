# Troubleshooting

## Enable Debug Logging

```bash
dotfiles install tool-name --trace --log=verbose
```

`--log=verbose` also shows the `DEBUG` lines that explain why a step was skipped.

## Where Generated Files Live

Every location the CLI writes to comes from the `paths` section of `dotfiles.config.ts`, documented in [Project Configuration](project-configuration.md). The steps below name those keys instead of fixed paths, because a project that customises them has a different layout:

- `paths.targetDir` holds the shims. The generated shell scripts add it to `PATH`.
- `paths.shellScriptsDir` holds `main.zsh`, `main.bash` and `main.ps1`, plus the `zsh/completions` directory.
- `paths.binariesDir` holds installed tools as `<tool>/current/<binary>`.

`dotfiles files` (with no argument) prints every file the CLI has written, tagged with its kind, so it is the quickest way to see the resolved locations:

```
- github-release--rg (shim): <paths.targetDir>/rg
- system (init): <paths.shellScriptsDir>/main.zsh
- system (completion): <paths.shellScriptsDir>/zsh/completions/_dotfiles
```

## Common Issues

### Tool Not Found After Installation

1. Verify `.bin()` names the executables the tool actually ships. `dotfiles bin --list` prints every configured binary with the tool that provides it.
2. Check the shim exists: `dotfiles files` must show a `(shim)` entry for the binary under `paths.targetDir`. If it is missing, run `dotfiles generate`.
3. Ensure `PATH` includes `paths.targetDir`. The generated `main.zsh` / `main.bash` add it, so source them as described in [Getting Started](getting-started.md); `command -v tool-name` should then resolve to the shim.
4. Check the tool itself is installed: `dotfiles bin tool-name` prints the installed binary under `paths.binariesDir`, and fails with `binary path does not exist: ...` when nothing has been installed yet. `dotfiles install tool-name` installs or repairs it.

### Installation Fails

1. Check asset patterns match actual GitHub release assets
2. Verify repository name is correct
3. Use `--trace --log=verbose` to see detailed error messages

### Infinite Recursion Error

**Message**: `Recursive installation detected for <tool>. Aborting to prevent infinite loop.`

The shim refuses to run while an installation of the same tool is already in progress. If you see this, check that your installation scripts and hooks don't call the tool being installed via its shim.

### Disable Shim Usage Tracking

Shim usage tracking is enabled by default: every run of a shim appends a line to `usage/shim-usage.log` under `paths.generatedDir`. See `.bin()` in [Core API](../api-reference/core-api.md).

- Disable temporarily for a single command:
  `DOTFILES_LOCAL_USAGE_TRACKING=0 rg --version`
- Disable for the current shell session:
  `export DOTFILES_LOCAL_USAGE_TRACKING=0`

### Dependency Errors

**Messages**:

- `tool "<tool>" depends on missing dependency "<binary>"`
- `ambiguous dependency: binary "<binary>" is provided by multiple tools: <tool>, <tool>`
- `dependency cycle detected among tools: <tool>, <tool>`

- Ensure every `.dependsOn()` references a binary from `.bin()` in exactly one tool; `dotfiles bin --list` shows which tool provides each binary
- Verify providers include active platform/architecture for platform-specific configs

### Shell Integration Not Working

1. Source the generated script for your shell from `paths.shellScriptsDir` (`dotfiles files` lists it as a `system (init)` entry). Setup instructions are in [Getting Started](getting-started.md).
2. Check for syntax errors: `zsh -n "<paths.shellScriptsDir>/main.zsh"`
3. Rerun `dotfiles generate` after changing any `.tool.ts` file; the scripts are not regenerated on their own
4. Use declarative `.env()` instead of inline exports

### Completions Not Loading

1. Check the completion file was generated: `dotfiles files` lists each one as a `(completion)` entry. A completion produced by running the tool (`cmd`) is skipped until the tool is installed; `dotfiles generate --log=verbose` reports it as `Skipping zsh completion: binary "<name>" not installed at ...`
2. Reload completions: `autoload -U compinit && compinit`
3. Check the configuration against [Shell Completions](../api-reference/shell-completions.md)

### Shadow Warnings During Generate

**Messages**:

- `WARN   [tool]         Binary "name" shadows /usr/bin/name`
- `WARN   [tool]         [zsh] Alias "ls" shadows /bin/ls`
- `WARN   [tool]         [zsh] Function "cd" shadows zsh builtin "cd"`

`dotfiles generate` inspects active tool configurations for potential shadowing against external commands found on system `PATH` and standard shell builtins for `zsh`, `bash`, and `powershell`.

- **Intentional Binary Delegation**: If a tool's binary targets or delegates directly to the host system binary (e.g., via `install("manual", { binaryPath: "/usr/bin/..." })`), the warning is automatically suppressed.
- **Shimless Binaries**: If a binary is configured with `.bin("name", { shim: false })`, it is not placed on PATH and will not trigger a binary shadow warning.
- **Resolving Conflicts**: If the shadowing is unintentional, consider renaming the conflicting alias or function, or scoping it appropriately.

### Hook Not Executing

```typescript builder
.hook('after-install', async ({ log, $ }) => {
  try {
    await $`./setup.sh`;
  } catch (error) {
    log.error('Setup failed');
    throw error;
  }
})
```

- `$` runs from the directory containing the `.tool.ts` file; see Working Directory in [Hooks](../api-reference/lifecycle-hooks.md)
- Always await `$` commands
- A rejected hook fails the installation, so handle expected errors with try/catch

## Testing and Verification

### Validate Configuration

```bash
dotfiles validate            # every configured tool
dotfiles validate tool-name  # one tool
```

Type-check the `.tool.ts` files with the TypeScript compiler against the project's `tsconfig.json` (`tsc -p tsconfig.json`).

### Useful Commands

```bash
dotfiles install tool-name                        # Install by tool or binary name
dotfiles install tool-name --force                # Force reinstall
dotfiles install tool-name --trace --log=verbose  # Debug logging
dotfiles why tool-or-binary                       # Print path to the .tool.ts that defines it
dotfiles files tool-name                          # Tree of the installed files
dotfiles bin tool-or-binary                       # Print path to the installed binary
```

Every command and flag is documented in the [CLI Reference](../getting-started/cli-reference.md).

### Verification Steps

1. **Binary works**: `tool-name --version` (the first run through the shim installs the tool)
2. **Shim created**: `dotfiles files` shows a `(shim)` entry for it under `paths.targetDir`, and `command -v tool-name` resolves to that path
3. **Tool installed**: `dotfiles bin tool-name` prints the binary under `paths.binariesDir`
4. **Shell integration**: Source the generated shell script and test aliases/environment
