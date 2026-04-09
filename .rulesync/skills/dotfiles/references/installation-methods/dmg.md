# DMG Installation

Install macOS applications distributed as DMG disk images. The plugin mounts the DMG, copies the `.app` bundle to `/Applications`, and is silently skipped on non-macOS platforms.

The DMG source is configured via a required `source` object. Sources can be direct URLs or GitHub releases.

If the resolved source points to a supported archive (`.zip`, `.tar.gz`, etc.) containing a `.dmg` file, the archive is automatically extracted first. This is common for GitHub releases that compress DMGs into zip files.

DMG is externally managed. Temporary files (download, mount point, optional archive extraction) use `stagingDir`, but the final `.app` is installed to `/Applications`.

Shims are not supported for DMG-installed applications. The `.bin()` method should not be used with this installer.

## Basic Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install) =>
  install('dmg', {
    source: {
      type: 'url',
      url: 'https://example.com/MyApp-1.0.0.dmg',
    },
  })
);
```

## Parameters

| Parameter      | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| `source`       | **Required**. DMG source definition (see source variants below)                |
| `appName`      | Name of the `.app` bundle (e.g., `'MyApp.app'`). Auto-detected if omitted      |
| `binaryPath`   | Relative path to binary inside `.app`. Defaults to `Contents/MacOS/{bin name}` |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)                            |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`)                    |
| `env`          | Environment variables (static or dynamic function)                             |

### Source Variants

| Source type      | Required fields | Optional fields                                                   | Notes                                                    |
| ---------------- | --------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `url`            | `url`           | —                                                                 | Direct DMG URL or archive URL containing a DMG           |
| `github-release` | `repo`          | `version`, `assetPattern`, `assetSelector`, `ghCli`, `prerelease` | Resolves release asset first, then installs from the DMG |

## Examples

### Explicit App Name

```typescript
install('dmg', {
  source: {
    type: 'url',
    url: 'https://example.com/MyApp-1.0.0.dmg',
  },
  appName: 'MyApp.app',
}).version('1.0.0');
```

### From Archive Containing DMG

```typescript
install('dmg', {
  source: {
    type: 'url',
    url: 'https://github.com/example/app/releases/download/v1.0.0/MyApp.dmg.zip',
  },
});
```

### GitHub Release Source

```typescript
install('dmg', {
  source: {
    type: 'github-release',
    repo: 'manaflow-ai/cmux',
    assetPattern: '*macos*.dmg',
  },
  appName: 'cmux.app',
});
```

### With Version Detection

```typescript
install('dmg', {
  source: {
    type: 'url',
    url: 'https://example.com/MyApp-1.0.0.dmg',
  },
  versionArgs: ['--version'],
  versionRegex: /v(\d+\.\d+\.\d+)/,
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
- GitHub releases that distribute `.dmg` files inside `.zip` or `.tar.gz` archives

Prefer `brew` when the tool is available as a Homebrew formula or cask. Prefer `curl-binary` or `github-release` for cross-platform tools.
