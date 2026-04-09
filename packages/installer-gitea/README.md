# @dotfiles/installer-gitea

Gitea/Forgejo Release installer plugin for the dotfiles tool installer system. Supports any Gitea-compatible instance including Codeberg, Forgejo, and self-hosted Gitea.

## Usage

```typescript
import { GiteaReleaseInstallerPlugin } from "@dotfiles/installer-gitea";

const giteaPlugin = new GiteaReleaseInstallerPlugin(
  fileSystem,
  downloader,
  archiveExtractor,
  hookExecutor,
  cache, // optional
);

pluginRegistry.register(giteaPlugin);
```

## Tool Configuration

```typescript
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "Codeberg/pages-server",
}).bin("pages-server");
```

### With Asset Pattern

```typescript
install("gitea-release", {
  instanceUrl: "https://codeberg.org",
  repo: "owner/tool",
  assetPattern: "*x86_64.tar.gz",
}).bin("tool");
```

### With Authentication

```typescript
install("gitea-release", {
  instanceUrl: "https://gitea.example.com",
  repo: "org/private-tool",
  token: process.env.GITEA_TOKEN,
}).bin("tool");
```

## Parameters

| Parameter       | Required | Description                                   |
| --------------- | -------- | --------------------------------------------- |
| `instanceUrl`   | Yes      | Base URL of the Gitea/Forgejo instance        |
| `repo`          | Yes      | Repository in `owner/repo` format             |
| `assetPattern`  | No       | Glob or regex pattern to match release assets |
| `assetSelector` | No       | Custom function to select the correct asset   |
| `version`       | No       | Specific version tag (e.g., `v1.2.3`)         |
| `prerelease`    | No       | Include prereleases when fetching latest      |
| `token`         | No       | API token for authentication                  |

## Supported Instances

- [Codeberg](https://codeberg.org)
- [Forgejo](https://forgejo.org)
- [Gitea](https://gitea.com)
- Any self-hosted Gitea-compatible server

## Dependencies

- `@dotfiles/core` - Plugin interface and shared types
- `@dotfiles/installer` - Installer utilities
- `@dotfiles/downloader` - File download functionality
- `@dotfiles/archive-extractor` - Archive extraction
- `@dotfiles/file-system` - File system operations
- `@dotfiles/arch` - Platform/architecture detection
