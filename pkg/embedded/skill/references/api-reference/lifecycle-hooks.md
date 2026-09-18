# Hooks

Hooks allow custom logic at different stages of the installation process.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .hook("after-install", async (context) => {
      const { $, log, fileSystem } = context;
      await $`./tool init`;
      log.info("Tool initialized");
    }),
);
```

## Hook Events

The four events, listed in the order one installation reaches them. An event is
registered under exactly the name in the first column: the names are kebab-case, and
registering any other name fails when the configuration is read, rather than leaving a
handler that nothing would ever call.

| Order | Event            | When                              | Adds to the context                      |
| ----- | ---------------- | --------------------------------- | ---------------------------------------- |
| 1     | `before-install` | Before the installer runs         | `stagingDir`                             |
| 2     | `after-download` | After an asset is fetched to disk | `downloadPath`                           |
| 3     | `after-extract`  | After an archive is unpacked      | `extractDir`                             |
| 4     | `after-install`  | After the tool is in place        | `installedDir`, `binaryPaths`, `version` |

An installation reaches only the events its method produces: a method that downloads
nothing never emits `after-download`, and one that extracts no archive never emits
`after-extract`.

A hook that throws fails the installation. Nothing is swallowed: if the handler rejects,
the tool is reported as failed with the error the hook raised.

`before-install` is where a tool stages files itself: anything the hook puts into
`stagingDir` is promoted alongside what the installer produces. For a `manual` tool
without `binaryPath` the hook is the only thing that populates the staging directory,
so if it is still empty once the installer has run, the installation fails with an error
naming the directory instead of promoting an empty one, and `after-install` does not run.

## Context Properties

Every hook receives:

| Property        | Description                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `toolName`      | Name of the tool                                                                                                |
| `currentDir`    | Stable directory for this tool (the `current` symlink)                                                          |
| `stagingDir`    | Absolute path of the temporary directory the installer stages into                                              |
| `toolDir`       | Directory holding this tool's `.tool.ts`                                                                        |
| `systemInfo`    | Platform, architecture and libc                                                                                 |
| `projectConfig` | Project configuration                                                                                           |
| `fileSystem`    | File operations (`mkdir`, `ensureDir`, `writeFile`, `readFile`, `exists`, `readdir`, `rm`, `rename`, `symlink`) |
| `log`           | Structured logging (`debug`, `info`, `warn`, `error`)                                                           |
| `$`             | Shell executor                                                                                                  |

Plus whatever the event itself provides, per the table above. A property an event does
not provide is `undefined` rather than a misleading empty value, so destructuring
`installedDir` in a `before-install` hook gives you `undefined` -- there is nothing
installed yet to point at.

Every event hands the handler the same type, `IHookContext`, exported from
`@alexgorbatchev/dotfiles`; the event-specific members are optional on it. Annotate a
handler's parameter with it when the handler is declared separately from `.hook()`.

`$` is available only to hooks. A tool factory does not get one: configuration is read
on every CLI invocation, so running commands from there would execute them constantly.

### Working Directory

Commands run from the directory containing the tool's `.tool.ts`, so a script shipped
next to it is reached as `./scripts/setup.sh`. Anywhere else you might want is already
in the context by name, and interpolating it says plainly which tree you mean:

```typescript builder
.hook('after-install', async ({ $, installedDir }) => {
  await $`./scripts/setup.sh`;          // next to the tool config
  await $`${installedDir}/bin/tool --version`;  // the installed tree
})
```

## Examples

### File Operations

```typescript builder
.hook('after-install', async ({ fileSystem, projectConfig, log }) => {
  const configDir = `${projectConfig.paths.homeDir}/.config/tool`;
  await fileSystem.mkdir(configDir); // parents are created as needed
  await fileSystem.writeFile(`${configDir}/config.toml`, 'theme = "dark"');
  log.info('Configuration created');
})
```

### Shell Commands

```typescript builder
.hook('after-install', async ({ $, installedDir }) => {
  // Run tool command
  await $`${installedDir}/tool init`;

  // Capture output
  const version = await $`./tool --version`.text();
})
```

### Executing Installed Binaries by Name

In `after-install` hooks, the shell's PATH is automatically enhanced to include the directories containing the installed binaries. This means you can execute freshly installed tools by name without specifying the full path:

```typescript builder
.hook('after-install', async ({ $ }) => {
  // The installed binary is automatically available by name
  await $`my-tool --version`;

  // No need to use full paths like:
  // await $`${installedDir}/bin/my-tool --version`;
})
```

This PATH enhancement only applies to `after-install` hooks where `binaryPaths` is available in the context.

### Shell Command Logging

Shell commands executed in hooks are automatically logged to help with debugging and visibility:

- Commands are logged as `$ command` at info level before execution
- Stdout lines are logged as `| line` at info level
- Stderr lines are logged as `| line` at error level (only if stderr has content)

Example output:

```
$ my-tool init
| Initializing configuration...
| Configuration complete!
```

`.quiet()` suppresses both the echoed command and its output, for commands whose output
is noise or is being captured with `.text()` instead.

### Platform-Specific Setup

```typescript builder
.hook('after-install', async ({ systemInfo, $ }) => {
  if (systemInfo.os === 'darwin') {
    await $`./setup-macos.sh`;
  } else if (systemInfo.os === 'linux') {
    await $`./setup-linux.sh`;
  }
})
```

### File Text Replacement

`replaceInFile` edits a file in place and returns whether anything changed. Every match
is replaced with or without the `g` flag, and the file is left alone when nothing matched
or when the result is identical to what was already there.

```typescript builder
.hook('after-install', async ({ replaceInFile, installedDir }) => {
  await replaceInFile(`${installedDir}/config.toml`, /theme = ".*"/, 'theme = "dark"');
})
```

Full parameters, options and the callback argument are in [utilities.md](utilities.md).

### Build from Source

```typescript builder
.hook('after-extract', async ({ extractDir, stagingDir, $ }) => {
  if (extractDir) {
    await $`cd ${extractDir} && make build`;
    await $`mv ${extractDir}/target/release/tool ${stagingDir}/tool`;
  }
})
```

## Error Handling

```typescript builder
.hook('after-install', async ({ $, log }) => {
  try {
    await $`./tool self-test`;
  } catch (error) {
    log.error('Self-test failed');
    throw error; // Re-throw to fail installation
  }
})
```

### Custom Binary Processing

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/custom-tool" })
    .bin("custom-tool")
    .hook("after-extract", async ({ extractDir, stagingDir, fileSystem, log }) => {
      if (extractDir) {
        // Custom binary selection and processing
        const binaries = await fileSystem.readdir(`${extractDir}/bin`);
        const mainBinary = binaries.find((name) => name.startsWith("main-"));

        if (mainBinary) {
          await fileSystem.rename(`${extractDir}/bin/${mainBinary}`, `${stagingDir}/tool`);
          log.info(`Selected binary: ${mainBinary}`);
        }
      }
    }),
);
```

### Environment-Specific Setup

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/custom-tool" })
    .bin("custom-tool")
    .hook("after-install", async ({ systemInfo, fileSystem, log, $ }) => {
      // Platform-specific setup
      if (systemInfo.os === "darwin") {
        // macOS-specific setup
        await $`./setup-macos.sh`;
      } else if (systemInfo.os === "linux") {
        // Linux-specific setup
        await $`./setup-linux.sh`;
      }

      // Architecture-specific setup
      if (systemInfo.arch === "arm64") {
        log.info("Configuring for ARM64 architecture");
        await $`./configure-arm64.sh`;
      }
    }),
);
```

## Environment Variables in Installation

Set environment variables during installation (for curl-script installs):

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("curl-script", {
    url: "https://example.com/install.sh",
    shell: "bash",
    env: {
      INSTALL_DIR: "~/.local/bin",
      ENABLE_FEATURE: "true",
      API_KEY: process.env.TOOL_API_KEY || "default",
    },
  }).bin("my-tool"),
);
```

## Best Practices

1. **Use `$` for shell operations** that need to work with files relative to your tool config
2. **Use `fileSystem` methods** for cross-platform file operations that don't require shell features
3. **Always handle errors appropriately** in hooks to provide clear feedback
4. **Use `log` for all output** - avoid `console.log()` in favor of structured logging:
   - `log.info()` for general information
   - `log.warn()` for warnings
   - `log.error()` for error conditions
   - `log.debug()` for debugging and troubleshooting
5. **Test your hooks** on different platforms to ensure compatibility
6. **Keep hooks focused** - each hook should have a single responsibility
7. **Document complex logic** - explain what your hooks are doing and why

## Complete Example

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/custom-tool" })
    .bin("custom-tool")
    .symlink("./config.yml", "~/.config/custom-tool/config.yml")
    .hook("before-install", async ({ log }) => {
      log.info("Starting custom-tool installation...");
    })
    .hook("after-extract", async ({ extractDir, log, $ }) => {
      if (extractDir) {
        // Build additional components
        log.info("Building plugins...");
        await $`cd ${extractDir} && make plugins`;
      }
    })
    .hook("after-install", async ({ toolName, installedDir, projectConfig, fileSystem, log, $ }) => {
      // Create data directory
      const dataDir = `${projectConfig.paths.homeDir}/.local/share/${toolName}`;
      await fileSystem.mkdir(dataDir);

      // Initialize tool
      await $`${installedDir}/${toolName} init --data-dir ${dataDir}`;

      // Set up completion
      await $`${installedDir}/${toolName} completion zsh > ${projectConfig.paths.generatedDir}/completions/_${toolName}`;

      log.info(`Initialized ${toolName} with data directory: ${dataDir}`);
    })
    .zsh((shell) => shell.env({ CUSTOM_TOOL_DATA: "~/.local/share/custom-tool" }).aliases({ ct: "custom-tool" })),
);
```
