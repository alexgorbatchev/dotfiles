# github-release

Download and install tools from GitHub releases with automatic platform asset selection.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("github-release", { repo: "junegunn/fzf" }).bin("fzf"));
```

## Parameters

| Parameter       | Description                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `repo`          | **Required**. GitHub repository in "owner/repo" format                                                    |
| `assetPattern`  | Glob pattern to match release assets. **Optional**. Use only if default automatic selection fails.        |
| `assetSelector` | Custom function to select the correct asset. **Optional**. Use only if default automatic selection fails. |
| `version`       | Specific version (e.g., `'v1.2.3'`)                                                                       |
| `prerelease`    | Include prereleases when fetching latest (default: false)                                                 |
| `githubHost`    | Custom GitHub API host for Enterprise                                                                     |
| `ghCli`         | Use `gh` CLI for API requests instead of fetch                                                            |
| `env`           | Environment variables (static or dynamic function)                                                        |

## Examples

## Asset Selection (Optional)

The installer uses built-in smart selection logic by default. It parses filenames and correctly matches combinations of OS and CPU architecture (e.g. `linux`/`darwin`/`macos`/`win`/`windows` + `amd64`/`arm64`/`aarch64`/`x64`/`x86_64`).

**You should ONLY provide an `assetPattern` or `assetSelector` if the default selection logic fails to find a file or downloads the wrong asset.**

### With Asset Pattern

```typescript
install("github-release", {
  repo: "sharkdp/bat",
  assetPattern: "*linux_amd64.tar.gz",
}).bin("bat");
```

### Custom Asset Selector

Use `assetSelector` when the repository uses non-standard asset names or when you intentionally want something other than the default smart selector. Standard Linux `gnu` vs `musl` release names are handled automatically.

```typescript
install("github-release", {
  repo: "example/tool",
  assetSelector: ({ assets }) => {
    return assets.find((a) => a.name.endsWith("-portable.tar.gz"));
  },
}).bin("tool");
```

### Specific Version

```typescript
install("github-release", {
  repo: "owner/tool",
  version: "v2.1.0",
}).bin("tool");
```

### Using gh CLI

Use the `gh` CLI for API requests instead of fetch. Useful when working behind proxies or leveraging existing `gh` authentication:

```typescript
install("github-release", {
  repo: "owner/tool",
  ghCli: true,
}).bin("tool");
```

### Including Prereleases

By default, GitHub's "latest" excludes prereleases. Use `prerelease: true` for repos that only publish prerelease versions:

```typescript
install("github-release", {
  repo: "owner/nightly-only-tool",
  prerelease: true,
}).bin("tool");
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
| `libc`     | `gnu`, `musl`, `unknown`   |
