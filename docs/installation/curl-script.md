# Curl Script Installation

Downloads and executes shell installation scripts.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  }).bin('bun')
);
```

## Parameters

| Parameter | Type                            | Required | Description                         |
| --------- | ------------------------------- | -------- | ----------------------------------- |
| `url`     | `string`                        | Yes      | URL of the installation script      |
| `shell`   | `'bash' \| 'sh'`                | Yes      | Shell interpreter to use            |
| `args`    | `string[] \| (ctx) => string[]` | No       | Arguments to pass to the script     |
| `env`     | `Record<string, string>`        | No       | Environment variables for execution |

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

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
    env: { INSTALL_DIR: '$HOME/.local/bin' },
  }).bin('fly')
);
```

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
