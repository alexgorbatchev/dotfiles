# github-release

Download and install tools from GitHub releases with automatic platform asset selection.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("github-release", { repo: "junegunn/fzf" }).bin("fzf"));
```

## Parameters

| Parameter      | Description                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo`         | **Required**. GitHub repository in "owner/repo" format                                                                                                |
| `assetPattern` | Glob or regex pattern (`string` or `RegExp`) to match release assets. **Optional**. Prefer this when the default selector chooses the wrong filename. |
| `version`      | Specific version (e.g., `'v1.2.3'`)                                                                                                                   |
| `prerelease`   | Include prereleases when fetching latest (default: false)                                                                                             |
| `ghCli`        | Use `gh` CLI for API requests instead of fetch                                                                                                        |
| `token`        | GitHub API token; defaults to `GITHUB_TOKEN`, then `GH_TOKEN`, from the environment                                                                   |

The GitHub API host is a project setting (`github.host` in `dotfiles.config.ts`), not a per-tool parameter.

## Examples

## Cache Refresh Behavior

GitHub release metadata is cached for normal installs and update checks. When you run `dotfiles install --force <tool>` or `dotfiles update <tool>` for a `github-release` tool that tracks `latest`, dotfiles bypasses that metadata cache so the command rechecks GitHub before reinstalling.

## Asset Selection (Optional)

The installer uses built-in smart selection logic by default. It parses filenames and correctly matches combinations of OS and CPU architecture (e.g. `linux`/`darwin`/`macos`/`win`/`windows` + `amd64`/`arm64`/`aarch64`/`x64`/`x86_64`).

**You should ONLY provide an `assetPattern` if the default selection logic fails to find a file or downloads the wrong asset.** A `RegExp` pattern covers naming schemes a glob cannot express; the platform and architecture are still matched automatically within the assets the pattern keeps.

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
