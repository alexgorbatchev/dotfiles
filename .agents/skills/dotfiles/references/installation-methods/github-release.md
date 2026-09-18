# github-release

Download and install tools from GitHub releases with automatic platform asset selection.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("github-release", { repo: "junegunn/fzf" }).bin("fzf"));
```

## Parameters

| Parameter       | Description                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo`          | **Required**. GitHub repository in "owner/repo" format                                                                                                                 |
| `assetPattern`  | Glob or regex pattern (`string` or `RegExp`) to match release assets. **Optional**. Prefer this when the default selector chooses the wrong filename.                  |
| `assetSelector` | Callback choosing the asset itself. **Optional**. Reach for it only when a pattern cannot express the choice -- see [With an Asset Selector](#with-an-asset-selector). |
| `version`       | Specific version (e.g., `'v1.2.3'`)                                                                                                                                    |
| `prerelease`    | Include prereleases when fetching latest (default: false)                                                                                                              |
| `ghCli`         | Use `gh` CLI for API requests instead of fetch                                                                                                                         |
| `token`         | GitHub API token; defaults to the project's [`github.token`](../configuration/project-configuration.md#github), then the environment                                   |

The GitHub API host is a project setting (`github.host` in `dotfiles.config.ts`), not a per-tool parameter.

## Examples

## Cache Refresh Behavior

GitHub release metadata is cached for normal installs and update checks. When you run `dotfiles install --force <tool>` or `dotfiles update <tool>` for a `github-release` tool that tracks `latest`, dotfiles bypasses that metadata cache so the command rechecks GitHub before reinstalling.

## Asset Selection (Optional)

The installer uses built-in smart selection logic by default. It parses filenames and correctly matches combinations of OS and CPU architecture (e.g. `linux`/`darwin`/`macos`/`win`/`windows` + `amd64`/`arm64`/`aarch64`/`x64`/`x86_64`).

**You should ONLY provide an `assetPattern` if the default selection logic fails to find a file or downloads the wrong asset.** A `RegExp` pattern covers naming schemes a glob cannot express; the platform and architecture are still matched automatically within the assets the pattern keeps.

There are three levels, and each gives up more of what the installer does for you: the
built-in selection, then `assetPattern`, then `assetSelector`. Only `assetSelector`
switches the built-in matcher off entirely, so reach for it last.

### With Asset Pattern

```typescript body
// Glob pattern
install("github-release", {
  repo: "sharkdp/bat",
  assetPattern: "*linux_amd64.tar.gz",
}).bin("bat");

// RegExp pattern (e.g. negative lookahead to exclude profile/debug variants)
install("github-release", {
  repo: "oven-sh/bun",
  assetPattern: /^(?!.*-profile).*\.zip$/,
}).bin("bun");
```

### With an Asset Selector

`assetSelector` is a callback that picks the asset itself. It is the last resort, for a
choice a per-filename pattern cannot express: one that depends on the whole set of assets
at once ("the static build, but the dynamic one when there is no static build"), or on the
release rather than the filename ("the asset whose name carries the release's own tag").

```typescript body
install("github-release", {
  repo: "owner/tool",
  assetSelector: ({ assets, release }) =>
    assets.find((asset) => asset.name === `tool-${release.tag_name}-static.tar.gz`) ??
    assets.find((asset) => asset.name.endsWith(".tar.gz")),
}).bin("tool");
```

The callback is invoked once, after the release has been resolved, and may be `async`. Its
argument, `IAssetSelectionContext`, is the ordinary tool context (see
[Context API](../api-reference/context-api.md) and
[Utilities](../api-reference/utilities.md)) plus three members:

| Property       | Type                  | Description                                                                                                |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `assets`       | `IReleaseAsset[]`     | Every asset of the release, to choose one of.                                                              |
| `release`      | `IRelease`            | The release the assets belong to.                                                                          |
| `assetPattern` | `string \| undefined` | The configured `assetPattern`, when the tool has one. A `RegExp` arrives in its `/source/flags` text form. |

`IReleaseAsset` carries `name`, `browser_download_url` and `id`. `IRelease` carries `id`,
`tag_name`, `name`, `prerelease`, `assets`, and `draft` -- which GitHub reports and Gitea
does not.

Two behaviours are worth knowing before you write one:

**`assetPattern` is not applied for you.** Giving both a pattern and a selector hands the
pattern to the selector in `context.assetPattern` and leaves the narrowing to it. The
selector is the whole decision; nothing filters `assets` before it sees them.

**Choosing nothing fails the install.** A selector that returns `undefined`, or that names
an asset the release does not have, fails the tool with an error listing what the release
offered -- `the assetSelector of "tool" chose no asset. The release offers: ...`. It does
not quietly fall back to the built-in matcher: having asked for a specific asset, installing
a different one is exactly what the parameter exists to prevent.

### Specific Version

```typescript body
install("github-release", {
  repo: "owner/tool",
  version: "v2.1.0",
}).bin("tool");
```

### Using gh CLI

Use the `gh` CLI for API requests instead of fetch. Useful when working behind proxies or leveraging existing `gh` authentication:

```typescript body
install("github-release", {
  repo: "owner/tool",
  ghCli: true,
}).bin("tool");
```

### Including Prereleases

By default, GitHub's "latest" excludes prereleases. Use `prerelease: true` for repos that only publish prerelease versions:

```typescript body
install("github-release", {
  repo: "owner/nightly-only-tool",
  prerelease: true,
}).bin("tool");
```

## Asset Handling

When several assets fit the platform, the selector takes an archive over a raw binary and skips cargo-dist's `<tool>-<target>-update` self-updater, so a release that ships `tool-aarch64-apple-darwin.tar.xz` next to `tool-aarch64-apple-darwin-update` installs the tarball without an `assetPattern`.

The selected asset is then handled by its extension:

- An archive in one of the formats listed under [curl-tar › Supported Formats](curl-tar.md#supported-formats) is extracted and the declared binaries are promoted from the extracted tree.
- An asset with no archive extension (for example `tool-linux-amd64`) is installed as the binary itself.
- Anything else fails the install: an archive format that cannot be extracted (`.rar`, `.7z`, `.tar.zst`, a bare `.xz` or `.bz2`) or a file that is not a program (checksums, signatures, `.deb`/`.rpm` packages). Use `assetPattern` to select a different asset.

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |
| `*.{tar.xz,zip}`       | xz tarballs or zips |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)
