# gitea-release

Download and install tools from Gitea or Forgejo instance releases with automatic platform asset selection. Supports any Gitea-compatible instance including Codeberg, Forgejo, and self-hosted Gitea.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("gitea-release", {
    instanceUrl: "https://codeberg.org",
    repo: "Codeberg/pages-server",
  }).bin("pages-server"),
);
```

## Parameters

| Parameter      | Description                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `instanceUrl`  | **Required**. Base URL of the Gitea/Forgejo instance                                                                               |
| `repo`         | **Required**. Repository in "owner/repo" format                                                                                    |
| `assetPattern` | Glob or regex pattern (`string` or `RegExp`) to match release assets. **Optional**. Use only if default automatic selection fails. |
| `token`        | API token for authentication with the instance                                                                                     |

The release to install is chosen with `.version()`; without it the latest release is used.

## Examples

## Asset Selection (Optional)

The installer uses built-in smart selection logic by default. It parses filenames and correctly matches combinations of OS and CPU architecture (e.g. `linux`/`darwin`/`macos`/`win`/`windows` + `amd64`/`arm64`/`aarch64`/`x64`/`x86_64`).

**You should ONLY provide an `assetPattern` if the default selection logic fails to find a file or downloads the wrong asset.**

### With Asset Pattern

```typescript body
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
  assetPattern: "*linux_amd64.tar.gz",
}).bin("tool");
```

### Specific Version

```typescript body
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
})
  .bin("tool")
  .version("v2.1.0");
```

### With Authentication Token

For private repositories or to avoid rate limits:

```typescript body
install("gitea-release", {
  instanceUrl: "https://gitea.example.com",
  repo: "org/private-tool",
  token: process.env.GITEA_TOKEN,
}).bin("tool");
```

## Asset Handling

Asset selection and the handling of the selected asset (archive extraction, raw binaries, and the extensions that fail the install) are the same as for `github-release`; see [github-release › Asset Handling](github-release.md#asset-handling).

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |
| `*.{tar.xz,zip}`       | xz tarballs or zips |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)

Regex patterns can also be used by wrapping in forward slashes: `/tool-v\d+.*linux/`

## Supported Instances

Any server running the Gitea API v1 is supported:

- Codeberg — Free hosting for open source projects
- Forgejo — Community fork of Gitea
- Gitea — Self-hosted Git service
- Self-hosted instances
