# Gitea/Forgejo Release Installation

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

| Parameter       | Description                                               |
| --------------- | --------------------------------------------------------- |
| `instanceUrl`   | **Required**. Base URL of the Gitea/Forgejo instance      |
| `repo`          | **Required**. Repository in "owner/repo" format           |
| `assetPattern`  | Glob or regex pattern to match release assets             |
| `assetSelector` | Custom function to select the correct asset               |
| `version`       | Specific version (e.g., `'v1.2.3'`)                       |
| `prerelease`    | Include prereleases when fetching latest (default: false) |
| `token`         | API token for authentication with the instance            |
| `env`           | Environment variables (static or dynamic function)        |

## Examples

### With Asset Pattern

```typescript
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
  assetPattern: "*linux_amd64.tar.gz",
}).bin("tool");
```

### Custom Asset Selector

```typescript
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
  assetSelector: ({ assets, systemInfo }) => {
    const platform = systemInfo.platform === "darwin" ? "macos" : systemInfo.platform;
    return assets.find((a) => a.name.includes(platform));
  },
}).bin("tool");
```

### Specific Version

```typescript
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
  version: "v2.1.0",
}).bin("tool");
```

### With Authentication Token

For private repositories or to avoid rate limits:

```typescript
install("gitea-release", {
  instanceUrl: "https://gitea.example.com",
  repo: "org/private-tool",
  token: process.env.GITEA_TOKEN,
}).bin("tool");
```

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)

Regex patterns can also be used by wrapping in forward slashes: `/tool-v\d+.*linux/`

## Platform Detection

Available in `assetSelector` as `systemInfo`:

| Property   | Values                     |
| ---------- | -------------------------- |
| `platform` | `darwin`, `linux`, `win32` |
| `arch`     | `x64`, `arm64`             |

## Supported Instances

Any server running the Gitea API v1 is supported:

- Codeberg — Free hosting for open source projects
- Forgejo — Community fork of Gitea
- Gitea — Self-hosted Git service
- Self-hosted instances
