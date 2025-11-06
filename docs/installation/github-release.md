# GitHub Release Installation

The `github-release` method downloads and installs tools from GitHub releases, automatically selecting the appropriate asset for your platform.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository',
  })
    .bin('tool')
);
```

## Parameters

The `install('github-release', params)` function accepts:

```typescript
{
  repo: 'owner/repository',                    // Required
  version?: 'v1.2.3',                         // Optional
  assetPattern?: 'pattern',                    // Optional
  assetSelector?: (context) => asset,         // Optional
  includePrerelease?: false,                   // Optional
  githubHost?: 'github.com',                   // Optional
  env?: { KEY: 'value' },                      // Optional
  hooks?: {                                    // Optional
    beforeInstall?: async (ctx) => void,
    afterDownload?: async (ctx) => void,
    afterExtract?: async (ctx) => void,
    afterInstall?: async (ctx) => void,
  }
}
```

### Required Parameters

- **`repo`**: GitHub repository in "owner/repo" format

### Optional Parameters

- **`assetPattern`**: Glob pattern to match release assets
  ```typescript
  assetPattern: '*linux_amd64.tar.gz'
  assetPattern: 'tool-*-darwin-arm64.tar.gz'
  ```

- **`assetSelector`**: Custom function to select the correct asset
  ```typescript
  assetSelector: (context) => {
    const { assets, systemInfo } = context;
    return assets.find(asset => 
      asset.name.includes(systemInfo.platform)
    );
  }
  ```

- **`includePrerelease`**: Whether to include pre-releases when searching for versions

- **`githubHost`**: Custom GitHub API host for GitHub Enterprise installations

- **`env`**: Environment variables for the installation process

- **`hooks`**: Lifecycle hooks (`beforeInstall`, `afterDownload`, `afterExtract`, `afterInstall`)

## Examples

### Simple GitHub Release

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
);
```

### With Asset Pattern

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'sharkdp/bat',
    assetPattern: '*linux_amd64.tar.gz',
  })
    .bin('bat')
);
```

### Using Custom Asset Selector

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'example/tool',
    assetSelector: (context) => {
      const { assets, systemInfo } = context;
      const platformKey = systemInfo.platform === 'darwin' ? 'macos' : systemInfo.platform;
      const archKey = systemInfo.arch === 'arm64' ? 'aarch64' : systemInfo.arch;
      return assets.find(asset => 
        asset.name.includes(platformKey) && asset.name.includes(archKey)
      );
    },
  })
    .bin('tool')
);
```

### Specific Version

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    version: 'v2.1.0',
    assetPattern: '*linux*.tar.gz',
  })
    .bin('tool')
);
```

## How It Works

1. **Release Discovery**: Queries GitHub API for releases
2. **Asset Selection**: Uses pattern matching or custom selector to find the right asset
3. **Download**: Downloads the selected asset with caching
3. **Extraction**: Extracts archive to versioned directory
4. **Binary Setup**: Sets up binaries with executable permissions
5. **Shim Generation**: Creates shims that point to the installed binaries

## Platform Detection

The system automatically detects your platform and architecture:

- **Platform**: `darwin`, `linux`, `win32`
- **Architecture**: `x64`, `arm64`

These values are available in custom asset selectors as `sysInfo.platform` and `sysInfo.arch`.

## Asset Pattern Matching

Asset patterns support glob-style matching:

- `*` matches any characters
- `?` matches single character
- `[abc]` matches any character in brackets
- `{a,b}` matches either a or b

Common patterns:
```typescript
'*linux*amd64*.tar.gz'     // Linux x64 tarballs
'*darwin*arm64*.zip'       // macOS ARM64 zip files
'*windows*.exe'            // Windows executables
```

## Troubleshooting

**Asset not found**: Check the actual asset names in the GitHub release and adjust your pattern.

**Wrong binary selected**: Use `.bin('name', 'path/in/archive')` to specify the binary location.

**Platform detection issues**: Use a custom `assetSelector` for complex platform naming schemes.

## Next Steps

- [Homebrew Installation](./homebrew.md) - Alternative for package manager installation
- [Shell Integration](../shell-integration.md) - Configure shell environment after installation
- [Completions](../completions.md) - Set up command completions