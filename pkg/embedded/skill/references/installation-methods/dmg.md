# dmg

Install macOS applications distributed as DMG disk images. The plugin mounts the DMG read-only and hidden from the Finder, copies the `.app` bundle to `/Applications`, and is silently skipped on non-macOS platforms. The copy keeps the bundle's directory structure, file contents and permission bits, and recreates every symlink with its original target (extended attributes and resource forks are not copied). It replaces a bundle of the same name that is already installed rather than merging into it; the installed bundle stays in place until the new copy is complete. When the image cannot be detached afterwards, even with `hdiutil detach -force` (a process can hold a file on the volume open), the install fails with an error naming the mount point, which is left in place; detach the image yourself before installing again.

Without `appName`, the bundle installed is the first `.app` at the root of the volume, and a volume that holds none fails the install. The bundle must contain a readable `Contents/Info.plist` with a nonempty `CFBundleIdentifier`; dotfiles checks it before replacing an installed app. The installed copy's identifier and the SHA-256 hash of its Info.plist are recorded with its path for [verified removal](#removal).

The DMG source is configured via a required `source` object. Sources can be direct URLs or GitHub releases.

GitHub sources share [release download authentication and integrity checks](github-release.md#downloads-and-verification), applied before extracting an archive or mounting a DMG.

If the resolved source points to a supported archive (`.zip`, `.tar.gz`, etc.) containing a `.dmg` file, the archive is automatically extracted first. This is common for GitHub releases that compress DMGs into zip files.

DMG-installed applications are externally managed: temporary files (download, mount point, optional archive extraction) use `stagingDir`, the final `.app` is installed to `/Applications`, and `.bin()` names the command-line executables inside the bundle so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

## Contents

- [Basic Usage](#basic-usage)
- [Parameters](#parameters)
- [Examples](#examples)
- [Removal](#removal)
- [Platform Behavior](#platform-behavior)
- [When to Use](#when-to-use)

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("dmg", {
    source: {
      type: "url",
      url: "https://example.com/MyApp-1.0.0.dmg",
    },
  }),
);
```

## Parameters

| Parameter      | Description                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`       | **Required**. DMG source definition (see source variants below)                                                                              |
| `appName`      | Name of the `.app` bundle (e.g., `'MyApp.app'`). Defaults to the first `.app` at the volume's root; it must end in `.app` and contain no `/` |
| `binaryName`   | Executable inside `Contents/MacOS` of the bundle. Defaults to the tool name                                                                  |
| `binaryPath`   | Relative path to the binary inside `.app`, when it is not `Contents/MacOS/{binaryName}`                                                      |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)                                                                                          |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`)                                                                                  |
| `token`        | GitHub API token for a `github-release` source                                                                                               |

### Source Variants

| Source type      | Required fields | Optional fields                                                   | Notes                                                    |
| ---------------- | --------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `url`            | `url`           | —                                                                 | Direct DMG URL or archive URL containing a DMG           |
| `github-release` | `repo`          | `version`, `assetPattern`, `assetSelector`, `ghCli`, `prerelease` | Resolves release asset first, then installs from the DMG |

`assetSelector` goes inside `source`, next to the repository it selects from, and behaves
as it does for `github-release`: see
[github-release › With an Asset Selector](github-release.md#with-an-asset-selector).

A `github-release` source's `version` takes precedence over `.version()`, and
`dotfiles update` refuses a tool it pins
([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

## Examples

### Explicit App Name

```typescript body
install("dmg", {
  source: {
    type: "url",
    url: "https://example.com/MyApp-1.0.0.dmg",
  },
  appName: "MyApp.app",
}).version("1.0.0");
```

### From Archive Containing DMG

```typescript body
install("dmg", {
  source: {
    type: "url",
    url: "https://github.com/example/app/releases/download/v1.0.0/MyApp.dmg.zip",
  },
});
```

### GitHub Release Source

```typescript body
install("dmg", {
  source: {
    type: "github-release",
    repo: "manaflow-ai/cmux",
    assetPattern: "*macos*.dmg",
  },
  appName: "cmux.app",
});
```

### With Version Detection

```typescript body
install("dmg", {
  source: {
    type: "url",
    url: "https://example.com/MyApp-1.0.0.dmg",
  },
  versionArgs: ["--version"],
  versionRegex: /v(\d+\.\d+\.\d+)/,
});
```

## Removal

[`dotfiles tool uninstall`](../getting-started/cli-reference.md#dotfiles-tool-uninstall-tool), orphan cleanup during generation, and [`dotfiles state cleanup`](../getting-started/cli-reference.md#dotfiles-state-cleanup) share the same verification. On macOS, they remove only the recorded real `.app` directory directly inside a real `/Applications` directory, with both its bundle identifier and Info.plist hash unchanged. A tool's current `appName` is not evidence of ownership. After verification, cleanup removes its exact `.dotfiles-new-<App>.app` and `.dotfiles-old-<App>.app` siblings before removing the app. Each removed root gets one `rm` history entry and a removal log message.

A legacy installation without recorded identity, an unsafe path, a symlink, a replacement app, or an app whose Info.plist changed through self-update is left in place with a warning explaining why. Other dotfiles-owned artifacts are still cleaned up. No app bundle is removed on a non-macOS target or during a dry run.

A read, deletion, or history-write failure retains the receipt for retry, reports the error, and allows independent tools to continue. A deletion that succeeds before its history commits is reconciled on retry using the recorded pending path; an existing replacement still has to pass identity verification. If a partial deletion destroys Info.plist, restore the recorded plist or remove the remaining bundle manually before retrying. Cleanup never guesses ownership from a partially removed app.

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
