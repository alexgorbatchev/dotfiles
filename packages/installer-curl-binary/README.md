# @dotfiles/installer-curl-binary

Installer plugin for tools distributed as standalone binary files via direct URLs.

Downloads a binary file directly from a URL, makes it executable, and sets up
the binary path. Unlike `curl-tar`, this method does **not** extract an archive —
the downloaded file is the binary itself.

## Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("curl-binary", {
    url: "https://example.com/tool-v1.0.0-linux-amd64",
  }).bin("my-tool"),
);
```

## Parameters

| Parameter      | Type               | Required | Description                                      |
| -------------- | ------------------ | -------- | ------------------------------------------------ |
| `url`          | `string`           | Yes      | URL of the binary file to download               |
| `versionArgs`  | `string[]`         | No       | Arguments to pass to the binary to check version |
| `versionRegex` | `string \| RegExp` | No       | Regex to extract version from output             |
