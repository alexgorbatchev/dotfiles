# Curl Script Installation

Downloads and executes shell installation scripts.

## Basic Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  }).bin('bun')
);
```

## Parameters

| Parameter      | Type                                             | Required | Description                               |
| -------------- | ------------------------------------------------ | -------- | ----------------------------------------- |
| `url`          | `string`                                         | Yes      | URL of the installation script            |
| `shell`        | `'bash' \| 'sh'`                                 | Yes      | Shell interpreter to use                  |
| `args`         | `string[] \| (ctx) => string[]`                  | No       | Arguments to pass to the script           |
| `env`          | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic) |
| `versionArgs`  | `string[]`                                       | No       | Args to pass to binary for version check  |
| `versionRegex` | `string`                                         | No       | Regex to extract version from output      |

> **Note:** The `env` and `args` parameters support both static values and dynamic functions. Dynamic functions receive a context with `projectConfig`, `scriptPath`, and `stagingDir`.

## Understanding `stagingDir`

When the curl-script installer runs, it creates a temporary **staging directory** where the installation takes place. This is critical to understand because:

1. **The system expects binaries in `stagingDir`** - After your installation script completes, the tool installer looks for the declared binaries (from `.bin()`) inside `stagingDir`. If they are not there, installation fails.

2. **`stagingDir` becomes the versioned directory** - After successful installation, the entire staging directory is renamed to the final versioned path (e.g., `~/.dotfiles/tools/fnm/1.2.3`). All files in `stagingDir` are preserved.

3. **Most scripts need to be redirected** - By default, installation scripts install to their own preferred locations (like `~/.local/bin` or `~/.<tool>`). You must redirect them to `stagingDir` using the script's configuration options.

### How to Redirect Installation

Check the installation script's source to find the right argument or environment variable:

```bash
# Download and inspect the script
curl -fsSL https://fly.io/install.sh | less

# Look for variables like:
# INSTALL_DIR, PREFIX, BIN_DIR, FLYCTL_INSTALL, etc.
```

Then use `args` or `env` with the dynamic context to redirect:

```typescript
// Using args (if script accepts command-line arguments)
args: ((ctx) => ['--install-dir', ctx.stagingDir]);

// Using env (if script reads environment variables)
env: ((ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }));
```

## Examples

### With Static Arguments

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: ['--skip-shell', '--install-dir', '$LOCAL_BIN'],
  }).bin('fnm')
);
```

### With Dynamic Arguments

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (argsCtx) => ['--install-dir', argsCtx.stagingDir],
  }).bin('fnm')
);
```

The `args` function receives a context with:

- `projectConfig` - Project configuration with paths and settings
- `scriptPath` - Absolute path to the downloaded script (in `stagingDir`, already chmod +x)
- `stagingDir` - Temporary directory for this installation attempt. The script is downloaded here, along with any files your code creates. After successful installation, the entire directory is renamed to the versioned path (e.g., `<tool-name>/1.2.3`), preserving all contents.

### With Environment Variables

Use dynamic `env` to redirect installation to `stagingDir`:

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
    env: (ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }),
  }).bin('flyctl', 'fly')
);
```

Note: The fly.io script installs `flyctl` as the main binary. The second argument to `.bin()` creates `fly` as a symlink alias.

The `env` context provides:

- `projectConfig` - Project configuration with paths and settings
- `stagingDir` - Temporary directory for installation (becomes versioned path after success)
- `scriptPath` - Absolute path to the downloaded script (curl-script specific)

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .bin('tool')
    .hook('after-download', async (ctx) => {
      // Verify script before execution
    })
);
```

**Security Note**: Curl scripts execute arbitrary code. Only use trusted sources with HTTPS URLs.
