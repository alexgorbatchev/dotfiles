# curl-tar

Download and extract tarballs directly from URLs.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("curl-tar", {
    url: "https://example.com/tool.tar.gz",
  }).bin("tool"),
);
```

## Parameters

| Parameter      | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `url`          | **Required**. Direct URL to the archive                         |
| `sha256`       | Expected SHA-256 of the download; the install fails on mismatch |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)             |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`)     |

## Examples

### Binary in Subdirectory

```typescript body
install("curl-tar", {
  url: "https://releases.example.com/tool-v1.0.0.tar.gz",
}).bin("tool", "bin/tool"); // Binary at bin/tool in archive
```

### With Version Detection

```typescript body
install("curl-tar", {
  url: "https://releases.example.com/tool-v1.0.0.tar.gz",
  versionArgs: ["--version"],
  versionRegex: /tool (\d+\.\d+\.\d+)/,
}).bin("tool");
```

### With Shell Configuration

```typescript body
install("curl-tar", {
  url: "https://releases.example.com/tool-v1.0.0.tar.gz",
})
  .bin("tool")
  .zsh((shell) => shell.aliases({ t: "tool" }));
```

## Supported Formats

`.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tbz`, `.tar.xz`, `.txz`, `.tar`, `.zip`, single-file `.gz`, `.dmg`, `.pkg`

This is the full set the built-in extractor can unpack; `github-release` and `gitea-release` extract the same formats. For `.dmg` and `.pkg` prefer the dedicated [dmg](dmg.md) and [pkg](pkg.md) installers.

## When to Use

- Direct tarball downloads from known URLs
- Tools without GitHub releases
- Simple archive structures

Prefer `github-release` when GitHub releases are available.
