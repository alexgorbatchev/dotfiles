# Curl Binary Installation

Download standalone binary files directly from URLs. Unlike `curl-tar`, this method does **not** extract an archive — the downloaded file is the binary itself.

## Basic Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install) =>
  install('curl-binary', {
    url: 'https://example.com/tool-v1.0.0-linux-amd64',
  }).bin('tool')
);
```

## Parameters

| Parameter      | Description                                         |
| -------------- | --------------------------------------------------- |
| `url`          | **Required**. Direct URL to the binary file         |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`) |
| `versionRegex` | Regex to extract version from output                |
| `env`          | Environment variables (static or dynamic function)  |

## Examples

### With Version Detection

```typescript
install('curl-binary', {
  url: 'https://example.com/tool-v1.0.0-linux-amd64',
  versionArgs: ['--version'],
  versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
}).bin('tool');
```

### With Shell Configuration

```typescript
install('curl-binary', {
  url: 'https://example.com/tool-v1.0.0-linux-amd64',
})
  .bin('tool')
  .zsh((shell) => shell.aliases({ t: 'tool' }));
```

### Platform-Specific URLs

```typescript
import { Architecture, defineTool, Platform } from '@alexgorbatchev/dotfiles';

export default defineTool((install) =>
  install()
    .bin('tool')
    .platform(Platform.MacOS, Architecture.Arm64, (install) =>
      install('curl-binary', {
        url: 'https://example.com/tool-darwin-arm64',
      }))
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install('curl-binary', {
        url: 'https://example.com/tool-linux-amd64',
      }))
);
```

## When to Use

- Direct binary file downloads (single executable, no archive)
- Tools that distribute platform-specific binaries as standalone files
- Single-file Go or Rust binaries provided as direct downloads

Prefer `github-release` when GitHub releases are available. Prefer `curl-tar` when the download is an archive.
