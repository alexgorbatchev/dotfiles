# Platform-Specific Configuration

Use `.platform()` for cross-platform tool configurations.

## Platform and Architecture Enums

```typescript
import { Architecture, Platform } from "@alexgorbatchev/dotfiles";

// Platforms (bitwise flags)
Platform.Linux; // 1
Platform.MacOS; // 2
Platform.Windows; // 4
Platform.Unix; // Linux | MacOS (3)
Platform.All; // All platforms (7)

// Architectures (bitwise flags)
Architecture.X86_64; // 1
Architecture.Arm64; // 2
Architecture.All; // Both (3)
```

## Basic Usage

```typescript
import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .bin("tool")
    .platform(Platform.MacOS, (install) => install("brew", { formula: "tool" }))
    .platform(Platform.Linux, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*linux*.tar.gz",
      }),
    )
    .platform(Platform.Windows, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*windows*.zip",
      }),
    ),
);
```

## With Architecture

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .bin("tool")
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*linux-amd64*.tar.gz",
      }),
    )
    .platform(Platform.Linux, Architecture.Arm64, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*linux-arm64*.tar.gz",
      }),
    )
    .platform(Platform.MacOS, Architecture.All, (install) => install("brew", { formula: "tool" })),
);
```

## Platform Groups

Use `Platform.Unix` for shared Linux/macOS configuration:

```typescript
export default defineTool((install) =>
  install()
    .bin("tool")
    .platform(Platform.Unix, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*unix*.tar.gz",
      }),
    )
    .platform(Platform.Windows, (install) =>
      install("github-release", {
        repo: "owner/tool",
        assetPattern: "*windows*.zip",
      }),
    ),
);
```

## Platform-Specific Shell Config

```typescript
export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .platform(Platform.Unix, (install) =>
      install().zsh((shell) =>
        shell.env({
          TOOL_CONFIG: "~/.config/tool",
        }),
      ),
    )
    .platform(Platform.Windows, (install) =>
      install().powershell((shell) =>
        shell.env({
          TOOL_CONFIG: "~\\.config\\tool",
        }),
      ),
    ),
);
```

## Platform Detection in Hooks

Root-level hooks still apply when the actual installer is defined inside `.platform(...)`.
Use that pattern for shared lifecycle logic, then put only the platform-specific install method inside each override.

```typescript
export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .hook("after-install", async ({ systemInfo, $ }) => {
      if (systemInfo.platform === "darwin") {
        await $`./setup-macos.sh`;
      } else if (systemInfo.platform === "linux") {
        await $`./setup-linux.sh`;
      }

      if (systemInfo.arch === "arm64") {
        await $`./configure-arm64.sh`;
      }
    }),
);
```

## Common Asset Patterns

| Platform | Pattern Examples                               |
| -------- | ---------------------------------------------- |
| macOS    | `*darwin*.tar.gz`, `*macos*.zip`               |
| Linux    | `*linux*.tar.gz`, `*x86_64-unknown-linux-gnu*` |
| Windows  | `*windows*.zip`, `*pc-windows-msvc*`           |
| x86_64   | `*amd64*`, `*x86_64*`                          |
| ARM64    | `*arm64*`, `*aarch64*`                         |
