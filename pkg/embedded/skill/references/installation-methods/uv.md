# uv

Install Python CLI applications published as PyPI packages using `uv` in isolated virtual environments.

`uv` provisions and manages the Python virtual environment in its standard data location (`~/.local/share/uv/tools/<package>/`). Launcher symlinks are directed into dotfiles' managed binaries directory (`~/.dotfiles/.generated/binaries/<tool>/current/<binary>`), keeping system locations clean while shimming the tool through dotfiles.

## Basic Usage

```typescript
export default defineTool((install) => install("uv").bin("ruff"));
```

## Parameters

| Parameter | Type       | Required | Description                                                                   |
| --------- | ---------- | -------- | ----------------------------------------------------------------------------- |
| `package` | `string`   | No       | PyPI package name (defaults to tool name)                                     |
| `version` | `string`   | No       | Target version or constraint (e.g., `0.26.0`, `>=0.26.0`, defaults to latest) |
| `python`  | `string`   | No       | Python version constraint for the tool environment (e.g., `>=3.12`, `3.11`)   |
| `with`    | `string[]` | No       | Additional dependencies to install into the tool environment                  |
| `force`   | `boolean`  | No       | Pass `--force` to reinstall even when present (defaults to `false`)           |

## Examples

### Specific Version

```typescript
export default defineTool((install) =>
  install("uv", {
    package: "black",
    version: "24.10.0",
  }).bin("black"),
);
```

The `version` parameter takes precedence over `.version()`, and `dotfiles update` refuses a tool it pins ([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

### Version Constraints and Python Specification

```typescript
export default defineTool((install) =>
  install("uv", {
    package: "claude-swap",
    version: ">=0.26.0",
    python: ">=3.12",
  })
    .bin("claude-swap")
    .bin("cswap"),
);
```

### With Additional Dependencies

```typescript
export default defineTool((install) =>
  install("uv", {
    package: "httpie",
    with: ["httpie-jwt-auth"],
  }).bin("http"),
);
```

## How It Works

1. **Virtual Environment Isolation**: `uv` creates and manages the isolated virtual environment in its standard data directory (`~/.local/share/uv/tools/<package>/`).
2. **Dotfiles Launcher Isolation**: Installation sets `UV_TOOL_BIN_DIR=${stagingDir}` so launcher executables are placed directly into dotfiles' staging area rather than polluting `~/.local/bin`. Dotfiles then moves the staging directory to `.generated/binaries/<tool>/current/` and creates shims in `.generated/bin/`.
3. **Update check**: Queries PyPI (`https://pypi.org/pypi/<package>/json`) to discover the latest published version ([`tool check`](../getting-started/cli-reference.md#dotfiles-tool-check-tool)).
4. **Uninstall**: Runs `uv tool uninstall <package>`.
