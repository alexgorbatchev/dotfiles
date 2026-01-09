# Advanced Topics

Advanced configuration patterns for complex setups.

## Custom Asset Selection

For non-standard release naming, use `assetSelector`:

```typescript
export default defineTool((install) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: ({ assets, systemInfo, release, log }) => {
      const osMap: Record<string, string> = { darwin: 'macos', linux: 'linux' };
      const archMap: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
      
      return assets.find(a =>
        a.name.includes(osMap[systemInfo.platform]) &&
        a.name.includes(archMap[systemInfo.arch]) &&
        a.name.endsWith('.tar.gz')
      );
    },
  })
    .bin('tool')
);
```

## Dynamic Configuration

Use environment variables for runtime configuration:

```typescript
const isDev = process.env.NODE_ENV === 'development';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version(isDev ? 'latest' : 'v1.2.3')
    .zsh((shell) =>
      shell.environment({ TOOL_LOG_LEVEL: isDev ? 'debug' : 'info' })
    )
);
```

## Conditional Installation

Choose methods based on system capabilities:

```typescript
export default defineTool((install) => {
  if (process.platform === 'darwin' && process.env.HOMEBREW_PREFIX) {
    return install('brew', { formula: 'tool' }).bin('tool');
  }
  return install('github-release', { repo: 'owner/tool' }).bin('tool');
});
```

## Build from Source

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-extract', async ({ extractDir, stagingDir, $ }) => {
      if (extractDir && stagingDir) {
        await $`cd ${extractDir} && ./configure --prefix=${stagingDir}`;
        await $`cd ${extractDir} && make -j$(nproc)`;
        await $`cd ${extractDir} && make install`;
      }
    })
);
```

## Dependency Verification

Combine `.dependsOn()` with hooks for version checks:

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .dependsOn('node')
    .hook('before-install', async ({ log, $ }) => {
      const result = await $`node --version`.nothrow();
      if (result.exitCode !== 0) {
        throw new Error('Node is required but not available');
      }
      log.info(`Using Node ${result.stdout.toString().trim()}`);
    })
);
```

## Lazy Loading

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        function expensive-fn() {
          unfunction expensive-fn
          source "${ctx.currentDir}/expensive.zsh"
          expensive-fn "$@"
        }
      `)
    )
);
```

## Dynamic Completions

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(`
          tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
        `)
        .completions(`${ctx.projectConfig.paths.generatedDir}/completions/_tool`)
    )
);
```

## Parallel Setup Tasks

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, log }) => {
      await Promise.all([
        $`tool setup-task-1`,
        $`tool setup-task-2`,
        $`tool setup-task-3`,
      ]);
      log.info('All setup tasks completed');
    })
);
```

## Next Steps

- [Hooks](./hooks.md) - Hook lifecycle details
- [Common Patterns](./common-patterns.md) - More examples
- [Troubleshooting](./troubleshooting.md) - Debug configurations