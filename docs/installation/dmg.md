# DMG Installation

Install macOS applications distributed as DMG disk images. The plugin mounts the DMG, copies the `.app` bundle to the staging directory. Silently skipped on non-macOS platforms.

Shims are not supported for DMG-installed applications. The `.bin()` method should not be used with this installer.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
  })
);
```

## Parameters

| Parameter      | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| `url`          | **Required**. URL of the DMG file to download                                  |
| `appName`      | Name of the `.app` bundle (e.g., `'MyApp.app'`). Auto-detected if omitted      |
| `binaryPath`   | Relative path to binary inside `.app`. Defaults to `Contents/MacOS/{bin name}` |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)                            |
| `versionRegex` | Regex to extract version from output                                           |
| `env`          | Environment variables (static or dynamic function)                             |

## Examples

### Explicit App Name

```typescript
install('dmg', {
  url: 'https://example.com/MyApp-1.0.0.dmg',
  appName: 'MyApp.app',
}).version('1.0.0');
```

### With Version Detection

```typescript
install('dmg', {
  url: 'https://example.com/MyApp-1.0.0.dmg',
  versionArgs: ['--version'],
  versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
});
```

## Platform Behavior

| Platform | Behavior                                  |
| -------- | ----------------------------------------- |
| macOS    | Full installation via hdiutil             |
| Linux    | Silently skipped (returns empty binaries) |
| Windows  | Silently skipped (returns empty binaries) |

No `.platform()` wrapper is needed — the plugin handles platform detection internally.

## When to Use

- macOS applications distributed as `.dmg` disk images
- Tools that ship as `.app` bundles

Prefer `brew` when the tool is available as a Homebrew formula or cask. Prefer `curl-binary` or `github-release` for cross-platform tools.

## Next Steps

- [Homebrew](./homebrew.md) - Alternative for macOS tools
- [GitHub Release](./github-release.md) - Cross-platform alternative
- [Curl Binary](./curl-binary.md) - For direct binary downloads
