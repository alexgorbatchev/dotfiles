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
- **`env`**: Environment variables to set during installation

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