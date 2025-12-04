# Curl Script Installation

The `curl-script` method downloads and executes installation scripts.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  })
    .bin('bun')
);
```

## Parameters

The `install('curl-script', params)` function accepts:

```typescript
{
  url: 'https://example.com/install.sh',  // Required
  shell: 'bash' | 'sh',                   // Required
  args?: string[] | ((ctx) => string[] | Promise<string[]>), // Optional
  env?: { KEY: 'value' },                 // Optional
  hooks?: {                               // Optional
    beforeInstall?: async (ctx) => void,
    afterDownload?: async (ctx) => void,
  }
}
```

### Parameters

- **`url`**: URL of the installation script
- **`shell`**: Shell to use for execution (`'bash'` or `'sh'`)
- **`args`**: Arguments to pass to the script. Can be:
  - Static array: `['--arg1', '--arg2']`
  - Sync function: `(ctx) => ['--install-dir', ctx.projectConfig.paths.binariesDir]`
  - Async function: `async (ctx) => { ... return ['--arg1']; }`
- **`env`**: Environment variables to set during installation
- **`versionArgs`**: Arguments to pass to the binary to check the version (e.g. `['--version']`).
- **`versionRegex`**: Regex to extract version from output (e.g. `version (\d+\.\d+\.\d+)`).

## Examples

### Simple Script Installation

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  })
    .bin('bun')
);
```

### With Script Arguments (Static)

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: ['--skip-shell', '--install-dir', '$LOCAL_BIN'],
  })
    .bin('fnm')
);
```

**Note:** The example above has been updated to use `args` instead of `env.INSTALL_ARGS`. Arguments are now passed directly to the script.

### Custom Installation Directory
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (argsCtx) => [
      '--skip-shell',
      '--install-dir',
      argsCtx.projectConfig.paths.binariesDir,
    ],
  })
    .bin('fnm')
);
```

The args context provides:
- `projectConfig` - Full project configuration
- `scriptPath` - Path where script was downloaded
- `installDir` - Installation directory for the tool

### With Environment Variables

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    env: {
      INSTALL_ARGS: '--skip-shell --install-dir $LOCAL_BIN',
    },
  })
    .bin('fnm')
);
```

### Custom Installation Directory

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://get.docker.com',
    shell: 'sh',
    env: {
      INSTALL_DIR: `${ctx.homeDir}/.local/bin`,
      SKIP_SYSTEMD: 'true',
    },
  })
    .bin('docker')
);
```

## Security Considerations

**Important**: Curl scripts execute arbitrary code from the internet. Only use trusted sources.

**Best practices:**
- Verify the script source and reputation
- Review the script contents when possible
- Use HTTPS URLs only
- Consider alternatives like GitHub releases when available

## When to Use Curl Scripts

**Best for:**
- Official installation scripts from trusted projects
- Tools with complex installation requirements
- When other methods are not available

**Avoid when:**
- GitHub releases are available
- Package manager installation is possible
- The script source is untrusted

## Troubleshooting

**Script fails to execute:**
- Check that the URL is accessible
- Verify the shell type (bash vs sh)
- Review environment variables

**Permission issues:**
- Ensure the script has appropriate permissions
- Check if sudo is required (not recommended)

**Network issues:**
- Verify internet connectivity
- Check for proxy or firewall restrictions

## Next Steps

- [GitHub Release Installation](./github-release.md) - Safer alternative when available
- [Manual Installation](./manual.md) - For pre-installed tools
- [Hooks](../hooks.md) - Custom post-installation setup