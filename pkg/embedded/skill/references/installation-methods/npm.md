# npm

Install tools published as npm packages. Supports both `npm` and `bun` as package managers.

npm-installed tools are externally managed: the package manager owns the files, and `.bin()` names the executables the package provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("npm", { package: "prettier" }).bin("prettier"));
```

## Parameters

| Parameter        | Type             | Required | Description                                                                 |
| ---------------- | ---------------- | -------- | --------------------------------------------------------------------------- |
| `package`        | `string`         | No       | npm package name (defaults to tool name)                                    |
| `version`        | `string`         | No       | Version or version range (e.g., `3.0.0`, defaults to latest)                |
| `packageManager` | `'npm' \| 'bun'` | No       | Package manager to use for installation (defaults to `'npm'`)               |
| `force`          | `boolean`        | No       | Pass `--force` to `npm install -g` / `bun install -g` (defaults to `false`) |

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

1. **Install**: Runs `npm install -g <package>[@version]` (or `bun install -g <package>[@version]` when `packageManager: 'bun'`), adding `--force` when `force: true`
2. **Binaries**: Each declared `.bin()` name is resolved from the package manager's global bin directory (`npm config get prefix` + `/bin`, or `bun pm bin -g`)
3. **Update check**: Compares against `npm view <package> version` (npm) or `bun pm view <package> version` (bun)
