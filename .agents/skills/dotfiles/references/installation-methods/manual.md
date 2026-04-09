# Manual Installation

Installs files from your tool configuration directory (custom scripts, pre-built binaries) or registers configuration-only tools. The `manual` method can be called with or without params.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

// Install a custom script
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./scripts/my-tool.sh",
  }).bin("my-tool"),
);

// Without params (shell-only or dependency wrapper)
export default defineTool((install) =>
  install("manual")
    .bin("tokscale")
    .dependsOn("bun")
    .zsh((shell) =>
      shell.functions({
        tokscale: `bun x tokscale@latest`,
      }),
    ),
);

// Configuration-only tool (no binary)
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la" })));
```

## Parameters

| Parameter    | Type                                             | Required | Description                                        |
| ------------ | ------------------------------------------------ | -------- | -------------------------------------------------- |
| `binaryPath` | `string`                                         | No       | Path to binary relative to `.tool.ts` file         |
| `env`        | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic function) |

## Examples

### Pre-built Binary

```typescript
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./binaries/linux/x64/custom-tool",
  }).bin("custom-tool"),
);
```

### Configuration-Only Tool

```typescript
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la", la: "ls -A" })));
```

### With Shell Configuration

```typescript
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./bin/my-tool.sh",
  })
    .bin("my-tool")
    .zsh((shell) => shell.aliases({ mt: "my-tool" }).completions("./completions/_my-tool")),
);
```

**Notes:**

- Binary paths are relative to the tool configuration file location
- Files are copied to the managed installation directory with executable permissions
- Configuration-only tools use `install()` with no arguments and must not define `.bin()`
