# Curl Tar Installation

Download and extract tarballs directly from URLs.

## Basic Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
  }).bin('tool')
);
```

## Parameters

| Parameter         | Description                                         |
| ----------------- | --------------------------------------------------- |
| `url`             | **Required**. Direct URL to the tarball             |
| `extractPath`     | Path to binary within extracted archive             |
| `stripComponents` | Directory levels to strip during extraction         |
| `versionArgs`     | Arguments for version check (e.g., `['--version']`) |
| `versionRegex`    | Regex to extract version from output                |
| `env`             | Environment variables (static or dynamic function)  |

## Examples

### Binary in Subdirectory

```typescript
install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
}).bin('tool', 'bin/tool'); // Binary at bin/tool in archive
```

### With Shell Configuration

```typescript
install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
})
  .bin('tool')
  .zsh((shell) => shell.aliases({ t: 'tool' }));
```

## Supported Formats

`.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tar.xz`, `.txz`, `.tar`

## When to Use

- Direct tarball downloads from known URLs
- Tools without GitHub releases
- Simple archive structures

Prefer `github-release` when GitHub releases are available.
