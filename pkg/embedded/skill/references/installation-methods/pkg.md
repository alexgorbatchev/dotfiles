# pkg

Install macOS `.pkg` installer packages with the system `installer` command.

Use this for tools distributed as signed Apple installer packages instead of tarballs, binaries, or DMGs.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: "https://example.com/releases/my-tool.pkg",
    },
  }).bin("my-tool"),
);
```

## Parameters

- `source` (required)
  - `{ type: 'url', url }`
  - `{ type: 'github-release', repo, version?, assetPattern? }`
- `target` (optional): target volume for `installer -target`. Defaults to `'/'`.
- `token` (optional): GitHub API token for a `github-release` source.

Each declared `.bin()` name is resolved from `PATH` after the package is installed.

## Examples

```typescript body
install("pkg", {
  source: {
    type: "url",
    url: "https://example.com/releases/my-tool.pkg",
  },
  target: "/",
}).bin("my-tool");
```

```typescript body
install("pkg", {
  source: {
    type: "github-release",
    repo: "owner/tool",
    assetPattern: "*macos*.pkg",
  },
})
  .bin("tool")
  .sudo();
```

## Notes

- macOS only. Non-macOS platforms skip this install method.
- `.pkg` installers are externally managed after installation.
- Packages that declare root authorization should opt into `.sudo()` so explicit `dotfiles install <tool>` runs execute the macOS installer via `sudo`.
- GUI-only packages can omit `.bin()`.
