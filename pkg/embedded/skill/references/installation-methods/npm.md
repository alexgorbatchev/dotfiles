# npm

Install tools published as npm packages. Supports both `npm` and `bun` as package managers.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("npm", { package: "prettier" }).bin("prettier"));
```

## Parameters

| Parameter        | Type                                             | Required | Description                                                   |
| ---------------- | ------------------------------------------------ | -------- | ------------------------------------------------------------- |
| `package`        | `string`                                         | No       | npm package name (defaults to tool name)                      |
| `version`        | `string`                                         | No       | Version or version range (e.g., `3.0.0`, defaults to latest)  |
| `packageManager` | `'npm' \| 'bun'`                                 | No       | Package manager to use for installation (defaults to `'npm'`) |
| `env`            | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic function)            |

## Examples

### Specific Version

```typescript
export default defineTool((install) =>
  install("npm", {
    package: "prettier",
    version: "3.0.0",
  }).bin("prettier"),
);
```

### Using Bun

```typescript
export default defineTool((install) =>
  install("npm", {
    package: "prettier",
    packageManager: "bun",
  }).bin("prettier"),
);
```

### Scoped Package

```typescript
export default defineTool((install) =>
  install("npm", {
    package: "@angular/cli",
  }).bin("ng"),
);
```

### Install Specific Version

```typescript
export default defineTool((install) =>
  install("npm", {
    package: "typescript",
    version: "5.8.3",
  }).bin("tsc"),
);
```

## How It Works

1. **Install**: Runs `npm install -g <package>[@version]` (or `bun install -g <package>[@version]` when `packageManager: 'bun'`)
2. **Binaries**: Resolved from the package manager's global bin directory (`npm prefix -g` + `/bin`, or `bun pm bin -g`)
3. **Version**: Detected via `npm ls -g --depth=0 --json <package>` (npm) or `bun pm ls -g` (bun)
4. **Remote version metadata**: Resolved via `npm view <package>[@version] version` (npm) or `bun info <package>[@version] version --json` (bun)
