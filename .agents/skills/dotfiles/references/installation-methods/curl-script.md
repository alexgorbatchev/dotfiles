# curl-script

Downloads and executes shell installation scripts.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://bun.sh/install",
    shell: "bash",
  }).bin("bun"),
);
```

## Parameters

| Parameter      | Type                                                  | Required | Description                                 |
| -------------- | ----------------------------------------------------- | -------- | ------------------------------------------- |
| `url`          | `string`                                              | Yes      | URL of the installation script              |
| `shell`        | `'bash' \| 'sh'`                                      | No       | Shell interpreter to use (defaults to `sh`) |
| `args`         | `string[]`, or a function returning one               | No       | Arguments passed to the script              |
| `env`          | `Record<string, string>`, or a function returning one | No       | Environment variables set for the script    |
| `versionArgs`  | `string[]`                                            | No       | Args to pass to binary for version check    |
| `versionRegex` | `string \| RegExp`                                    | No       | Regex to extract version from output        |

`env` is honoured only by `curl-script`; every other installation method ignores it. The parameter every method shares, `auto`, is documented under [Base Install Parameters](../api-reference/core-api.md#base-install-parameters).

## Understanding `stagingDir`

When the curl-script installer runs, it creates a temporary **staging directory** where the installation takes place. This is critical to understand because:

1. **The system expects binaries in `stagingDir`** - After your installation script completes, the tool installer looks for the declared binaries (from `.bin()`) inside `stagingDir`. If they are not there, installation fails.

2. **`stagingDir` becomes the versioned directory** - After successful installation, the entire staging directory is renamed to the final versioned path (e.g., `~/.dotfiles/tools/fnm/1.2.3`). All files in `stagingDir` are preserved.

3. **Most scripts need to be redirected** - By default, installation scripts install to their own preferred locations (like `~/.local/bin` or `~/.<tool>`). You must redirect them to `stagingDir` using the script's configuration options.

### How to Redirect Installation

Check the installation script's source to find the right argument or environment variable:

```bash
# Download and inspect the script
curl -fsSL https://fly.io/install.sh | less

# Look for variables like:
# INSTALL_DIR, PREFIX, BIN_DIR, FLYCTL_INSTALL, etc.
```

Then use `args` or `env` with the resolver context to redirect:

```typescript body
// Using args (if script accepts command-line arguments)
install("curl-script", {
  url: "https://example.com/install.sh",
  shell: "bash",
  args: (ctx) => ["--install-dir", ctx.stagingDir],
});

// Using env (if script reads environment variables)
install("curl-script", {
  url: "https://fly.io/install.sh",
  shell: "sh",
  env: (ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }),
});
```

A literal `args` entry or `env` value may write `{stagingDir}` instead, and the runtime
substitutes the real directory before the script runs. That is the only placeholder; a
resolver is what you reach for when the value depends on anything else.

## Resolver Context

`args` and `env` each accept a function in place of a value. The function runs when the
script is about to be executed -- not when the configuration is read -- so it is given the
script it is about to run and the directory the installation is staging into, neither of
which exists any earlier. It may be `async`; the installer awaits it.

Its argument has the type `ICurlScriptResolverContext`. Two of its members are what make
it worth reaching for:

| Property     | Description                                                                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scriptPath` | Absolute path of the downloaded installation script, inside `stagingDir`. The installer marks it executable before running it, and deletes it afterwards so it is not promoted with the tool.                                                                   |
| `stagingDir` | The real staging directory, rather than the `{stagingDir}` placeholder a tool factory is given while the configuration is merely being read. After a successful installation the whole directory is renamed to the versioned path, preserving everything in it. |

Everything else on it is the ordinary tool context -- `toolName`, `toolDir`,
`configFileDir`, `currentDir`, `projectConfig` and
[`systemInfo`](../api-reference/context-api.md#ctxsysteminfo) from the
[Context API](../api-reference/context-api.md), and `log`, `fs`, `fileSystem`,
`replaceInFile` and `resolve` from [Utilities](../api-reference/utilities.md).

There is no `$` on a resolver context: running commands is a
[hook](../api-reference/lifecycle-hooks.md)'s privilege, and a resolver only produces a
value.

A resolver that throws fails that tool's installation with the error it raised. So does a
resolver whose result is the wrong shape -- `args` must resolve to a list of strings and
`env` to a map of strings -- reported as `the args resolver of "<tool>" produced <value>,
which is not a list of strings`.

## Examples

### With Static Arguments

```typescript
export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://fnm.vercel.app/install",
    shell: "bash",
    args: ["--skip-shell", "--install-dir", "{stagingDir}"],
  }).bin("fnm"),
);
```

### With Dynamic Arguments

```typescript
export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://fnm.vercel.app/install",
    shell: "bash",
    args: (argsCtx) => ["--install-dir", argsCtx.stagingDir],
  }).bin("fnm"),
);
```

### With Environment Variables

Use dynamic `env` to redirect installation to `stagingDir`:

```typescript
export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://fly.io/install.sh",
    shell: "sh",
    env: (ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }),
  }).bin("flyctl"),
);
```

### Inspecting the Script Before It Runs

`scriptPath` points at the script that is about to run, so a resolver can check it first.
Throwing from the resolver fails the installation, which is the point: a flag that has
been renamed upstream is caught here rather than after the script has installed itself
somewhere else.

```typescript
export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://example.com/install.sh",
    shell: "bash",
    args: async (scriptCtx) => {
      const script = await scriptCtx.fs.readFile(scriptCtx.scriptPath);
      if (!script.includes("--install-dir")) {
        throw new Error("the installer script no longer accepts --install-dir");
      }
      return ["--install-dir", scriptCtx.stagingDir];
    },
  }).bin("tool"),
);
```

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://example.com/install.sh",
    shell: "bash",
  })
    .bin("tool")
    .hook("after-download", async (ctx) => {
      // Verify script before execution
    }),
);
```

**Security Note**: Curl scripts execute arbitrary code. Only use trusted sources with HTTPS URLs.
