# npm Installation

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
| `versionArgs`    | `string[]`                                       | No       | Arguments for version check (e.g., `['--version']`)           |
| `versionRegex`   | `string \| RegExp`                               | No       | Regex to extract version from output                          |
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

### Custom Version Detection

```typescript
export default defineTool((install) =>
  install("npm", {
    package: "typescript",
    versionArgs: ["--version"],
    versionRegex: /(\d+\.\d+\.\d+)/,
  }).bin("tsc"),
);
```

## How It Works

1. **Install**: Runs `npm install --prefix <stagingDir> <package>[@version]` (or `bun add --cwd <stagingDir> <package>[@version]` when `packageManager: 'bun'`)
2. **Binaries**: Resolved from `node_modules/.bin/` in the install directory
3. **Version**: Detected via `npm ls --json` (npm), `node_modules/<package>/package.json` (bun), or custom `versionArgs`/`versionRegex`
4. **Updates**: Checked via `npm view <package> version` (regardless of package manager)
