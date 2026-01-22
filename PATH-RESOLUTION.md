# Path Resolution for `defineTool()`

This document describes how relative paths are resolved when absolute paths are not specified in `defineTool()` API methods.

## Context Properties Available to Users

The `IToolConfigContext` (passed as `ctx` in `defineTool`) provides:

| Property                | Description                              | Derived From                                             |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `toolDir`               | Directory containing the `.tool.ts` file | `path.dirname(filePath)`                                 |
| `currentDir`            | Stable symlink path after install        | `${projectConfig.paths.binariesDir}/${toolName}/current` |
| `projectConfig.paths.*` | All configured paths                     | User's config.yaml                                       |

---

## Path Resolution by API Method

**All relative paths are resolved against `toolDir`** (the directory containing the `.tool.ts` file).

### 1. Shell `.source(path)`

**File**: `packages/tool-config-builder/src/ShellConfigurator.ts`

**Resolution Logic**:

```
1. If absolute path → use as-is
2. If relative path → resolve against toolDir
```

**Example**:

```typescript
// If tool config is at /home/user/dotfiles/tools/fzf/fzf.tool.ts
shell.source('./shell/init.zsh');
// Resolves to: /home/user/dotfiles/tools/fzf/shell/init.zsh

// For files that ship with the installed tool, use ctx.currentDir:
shell.source(`${ctx.currentDir}/shell/key-bindings.zsh`);
```

---

### 2. Symlink `symlink(source, target)`

**File**: `packages/symlink-generator/src/SymlinkGenerator.ts` using `packages/utils/src/expandToolConfigPath.ts`

**Resolution Logic** (for both `source` and `target`):

```
1. Expand variables: ${paths.homeDir}, ${paths.dotfilesDir}, etc.
2. Expand ~ to projectConfig.paths.homeDir
3. If relative path → resolve against toolDir
```

**Example**:

```typescript
// If tool config is at /home/user/dotfiles/tools/lazygit/lazygit.tool.ts
symlink('./config.yml', '~/.config/lazygit/config.yml');
// source resolves to: /home/user/dotfiles/tools/lazygit/config.yml
// target resolves to: /home/user/.config/lazygit/config.yml
```

---

### 3. Completions `.completions(config)`

**File**: `packages/shell-init-generator/src/completion-generator/CompletionGenerator.ts`

**Resolution Logic** (for `source` property):

```
1. If absolute path → use as-is
2. If relative path → resolve against toolDir
```

**Example**:

```typescript
// Static source - file next to .tool.ts
shell.completions('_fzf');
// Resolves to: ${toolDir}/_fzf

// For files in installed archives, use ctx.currentDir:
shell.completions(`${ctx.currentDir}/completions/_fzf`);
```

---

### 4. Manual Installer `binaryPath`

**File**: `packages/installer-manual/src/installManually.ts`

**Resolution Logic**: Uses `expandToolConfigPath()` - same as symlinks.

```
1. Expand variables and ~
2. If relative → resolve against toolDir
```

**Example**:

```typescript
install('manual', { binaryPath: './bin/my-tool' });
// Resolves to: ${toolDir}/bin/my-tool
```

---

### 5. Binary Pattern `bin(name, pattern)`

**File**: `packages/tool-config-builder/src/toolConfigBuilder.ts`

**Default pattern**: `*/${name}`

**Resolution**: Patterns are resolved against `installedDir` at install time by the binary discovery utilities.

**Example**:

```typescript
bin('rg', '*/rg');
// At install time, searches for 'rg' in: ${installedDir}/**/rg
```

---

### 6. `ctx.replaceInFile(path, ...)`

**No automatic resolution** - paths are passed directly to the file system. Users must provide absolute paths or use context properties.

**Example**:

```typescript
ctx.replaceInFile(`${ctx.currentDir}/config.toml`, /pattern/, 'replacement');
```

---

## Summary Table

| API Method                | Relative Path Resolution Base           |
| ------------------------- | --------------------------------------- |
| `shell.source(path)`      | `toolDir`                               |
| `symlink(source, target)` | `toolDir`                               |
| `completions({ source })` | `toolDir`                               |
| `manual({ binaryPath })`  | `toolDir`                               |
| `bin(name, pattern)`      | `installedDir` (at install time)        |
| `ctx.replaceInFile(path)` | No resolution - absolute paths required |

---

## Hook Contexts

Different hook contexts provide different path properties:

| Hook             | Available Paths                            |
| ---------------- | ------------------------------------------ |
| `before-install` | `stagingDir` (UUID-based temp directory)   |
| `after-download` | `stagingDir`, `downloadPath`               |
| `after-extract`  | `stagingDir`, `downloadPath`, `extractDir` |
| `after-install`  | `installedDir`, `binaryPaths[]`            |

**Note**: `stagingDir` is temporary and may be renamed/deleted. Use `installedDir` (only in `after-install`) for the final installation location.
