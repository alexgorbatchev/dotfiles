# GitHub Release Installation

Download and install tools from GitHub releases with automatic platform asset selection.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) => install('github-release', { repo: 'junegunn/fzf' }).bin('fzf'));
```

## Parameters

| Parameter           | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `repo`              | **Required**. GitHub repository in "owner/repo" format |
| `assetPattern`      | Glob pattern to match release assets                   |
| `assetSelector`     | Custom function to select the correct asset            |
| `version`           | Specific version (e.g., `'v1.2.3'`)                    |
| `includePrerelease` | Include pre-releases when searching                    |
| `githubHost`        | Custom GitHub API host for Enterprise                  |
| `ghCli`             | Use `gh` CLI for API requests instead of fetch         |
| `env`               | Environment variables (static or dynamic function)     |

## Examples

### With Asset Pattern

```typescript
install('github-release', {
  repo: 'sharkdp/bat',
  assetPattern: '*linux_amd64.tar.gz',
}).bin('bat');
```

### Custom Asset Selector

```typescript
install('github-release', {
  repo: 'example/tool',
  assetSelector: ({ assets, systemInfo }) => {
    const platform = systemInfo.platform === 'darwin' ? 'macos' : systemInfo.platform;
    return assets.find((a) => a.name.includes(platform));
  },
}).bin('tool');
```

### Specific Version

```typescript
install('github-release', {
  repo: 'owner/tool',
  version: 'v2.1.0',
}).bin('tool');
```

### Using gh CLI

Use the `gh` CLI for API requests instead of fetch. Useful when working behind proxies or leveraging existing `gh` authentication:

```typescript
install('github-release', {
  repo: 'owner/tool',
  ghCli: true,
}).bin('tool');
```

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)

## Platform Detection

Available in `assetSelector` as `systemInfo`:

| Property   | Values                     |
| ---------- | -------------------------- |
| `platform` | `darwin`, `linux`, `win32` |
| `arch`     | `x64`, `arm64`             |

## Next Steps

- [Homebrew](./homebrew.md) - Package manager alternative
- [Platform Support](../platform-support.md) - Platform-specific configurations
