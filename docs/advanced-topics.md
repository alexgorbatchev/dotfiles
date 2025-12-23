# Advanced Topics

This section covers advanced configuration patterns and techniques for complex tool setups.

## Custom Asset Selection

For complex release patterns, implement custom asset selectors to handle non-standard naming conventions:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: (context) => {
      // Custom logic to select the right asset
      const { assets, systemInfo, logger } = context;
      
      logger.debug('Selecting asset for platform:', systemInfo.platform);
      
      const osMap = {
        'darwin': 'macos',
        'linux': 'linux',
        'win32': 'windows'
      };
      
      const archMap = {
        'x64': 'amd64',
        'arm64': 'arm64'
      };
      
      const osKey = osMap[systemInfo.platform];
      const archKey = archMap[systemInfo.arch];
      
      const selectedAsset = assets.find(asset => 
        asset.name.toLowerCase().includes(osKey) &&
        asset.name.toLowerCase().includes(archKey) &&
        asset.name.endsWith('.tar.gz')
      );
      
      if (selectedAsset) {
        logger.debug('Selected asset:', selectedAsset.name);
      } else {
        logger.warn('No matching asset found');
      }
      
      return selectedAsset;
    }
  })
    .bin('tool')
);
```

### Asset Selector Use Cases

**Complex Naming Schemes:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: (context) => {
      // Handle assets with inconsistent naming
      const { assets, systemInfo, logger } = context;
      
      logger.debug('Processing assets with complex naming scheme');
      
      const patterns = [
        `${systemInfo.platform}-${systemInfo.arch}`,
        `${systemInfo.platform}_${systemInfo.arch}`,
        systemInfo.platform === 'darwin' ? 'macos' : systemInfo.platform
      ];
      
      const selectedAsset = assets.find(asset => 
        patterns.some(pattern => asset.name.includes(pattern))
      );
      
      if (selectedAsset) {
        logger.debug('Matched pattern for asset:', selectedAsset.name);
      }
      
      return selectedAsset;
    }
  })
    .bin('tool')
);
```

**Version-Specific Logic:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: (context) => {
      // Different asset patterns for different versions
      const { assets, systemInfo, release, logger } = context;
      
      const version = release.tag_name || '';
      logger.debug('Selecting asset for version:', version);
      
      if (version.startsWith('v2.')) {
        // v2.x uses new naming scheme
        logger.debug('Using v2.x naming scheme');
        return assets.find(asset => 
          asset.name.includes(`${systemInfo.platform}-${systemInfo.arch}`)
        );
      } else {
        // v1.x uses old naming scheme
        logger.debug('Using v1.x naming scheme');
        return assets.find(asset => 
          asset.name.includes(`${systemInfo.platform}_${systemInfo.arch}`)
        );
      }
    }
  })
    .bin('tool')
);
```

## Dynamic Configuration

Use environment variables or system detection for runtime configuration:

```typescript
import { defineTool } from '@gitea/dotfiles';

const version = process.env.TOOL_VERSION || 'latest';
const enableFeature = process.env.ENABLE_FEATURE === 'true';

export default defineTool((install, ctx) => {
  const config = install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version(version);
  
  if (enableFeature) {
    config.zsh((shell) =>
      shell.environment({
        TOOL_FEATURE_ENABLED: '1'
      })
    );
  }
  
  return config;
});
```

### Environment-Based Configuration

**Development vs Production:**
```typescript
import { defineTool } from '@gitea/dotfiles';

const isDev = process.env.NODE_ENV === 'development';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version(isDev ? 'latest' : 'v1.2.3')
    .zsh((shell) =>
      shell.environment({
        TOOL_LOG_LEVEL: isDev ? 'debug' : 'info'
      })
    )
);
```

**User-Specific Configuration:**
```typescript
import { defineTool } from '@gitea/dotfiles';

const userPrefs = {
  theme: process.env.TOOL_THEME || 'dark',
  editor: process.env.EDITOR || 'vim'
};

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_THEME: userPrefs.theme,
        TOOL_EDITOR: userPrefs.editor
      })
    )
);
```

## Conditional Installation Methods

Choose installation methods based on system capabilities:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) => {
  let config = install('github-release', { repo: 'owner/tool' })
    .bin('tool');
  
  // Check if Homebrew is available on macOS
  if (process.platform === 'darwin' && process.env.HOMEBREW_PREFIX) {
    config = install('brew', { formula: 'tool' })
      .bin('tool');
  }
  
  return config;
});
```

## Complex Hook Patterns

### Multi-Stage Build Process

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-extract', async ({ extractDir, stagingDir, logger, $ }) => {
      if (extractDir && stagingDir) {
        logger.info('Starting multi-stage build...');
        
        // Stage 1: Configure
        await $`cd ${extractDir} && ./configure --prefix=${stagingDir}`;
        
        // Stage 2: Build
        await $`cd ${extractDir} && make -j$(nproc)`;
        
        // Stage 3: Install
        await $`cd ${extractDir} && make install`;
        
        logger.info('Multi-stage build completed');
      }
    })
);
```

### Dependency Management

Use `.dependsOn(...binaryNames)` to declare precise relationships between tools. The generator orders installations, detects cycles, and verifies that every dependency has exactly one provider on the active platform.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/consumer' })
    .bin('consumer')
    .dependsOn('shared-runtime', 'openssl')
);
```

For more complex setups you can combine dependency declarations with hooks—for example, to ensure a dependency meets minimum version requirements:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .dependsOn('node')
    .hook('before-install', async ({ logger, $ }) => {
      const versionCheck = await $`node --version`.nothrow();
      if (versionCheck.exitCode !== 0) {
        throw new Error('Node is required but not available');
      }

      const version = versionCheck.stdout.toString().trim();
      logger.info(`Using system Node ${version}`);
    })
);
```

This pattern lets the generator guarantee ordering while still allowing custom verification logic when a dependency must satisfy additional constraints.

## Advanced Shell Integration

### Lazy Loading Functions

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        # Lazy load expensive functions
        function expensive-tool-function() {
          # Undefine this function
          unfunction expensive-tool-function
          
          # Load the real implementation
          source "${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/expensive-functions.zsh"
          
          # Call the real function
          expensive-tool-function "$@"
        }
      `)
    )
);
```

### Dynamic Completion Loading

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(`
          # Generate completions once
          if [[ ! -f "${ctx.projectConfig.paths.generatedDir}/completions/_tool" ]]; then
            tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
          fi
        `)
        .always(`
          # Load completions dynamically
          if [[ -f "${ctx.projectConfig.paths.generatedDir}/completions/_tool" ]]; then
            source "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
          fi
        `)
    )
);
```

### Context-Aware Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        # Different behavior based on context
        function smart-tool() {
          if [[ -f ./.tool-config ]]; then
            # Project-specific configuration
            tool --config ./.tool-config "$@"
          elif [[ -f "${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml" ]]; then
            # User configuration
            tool --config "${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml" "$@"
          else
            # Default behavior
            tool "$@"
          fi
        }
      `)
    )
);
```

## Version Management

### Multiple Version Support

```typescript
import { defineTool } from '@gitea/dotfiles';

const versions = ['1.0.0', '2.0.0'];
const defaultVersion = process.env.TOOL_DEFAULT_VERSION || versions[0] || '1.0.0';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version(defaultVersion)
    .zsh((shell) =>
      shell.always(`
        function tool-switch-version() {
          local version=\${1:-${defaultVersion}}
          local tool_path="${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/\$version/tool"
          
          if [[ -x "\$tool_path" ]]; then
            export TOOL_VERSION="\$version"
            export TOOL_EXECUTABLE="\$tool_path"
            echo "Switched to tool version \$version"
          else
            echo "Version \$version not found"
            return 1
          fi
        }
      `)
    )
);
```

## Configuration Validation

### Runtime Validation

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ toolConfig, logger }) => {
      // Validate configuration
      const requiredBinaries = toolConfig.binaries || [];
      if (requiredBinaries.length === 0) {
        throw new Error('No binaries defined for tool');
      }
      
      // Validate shell configuration
      const shellConfig = toolConfig.shell?.zsh;
      if (shellConfig?.environment) {
        for (const [key, value] of Object.entries(shellConfig.environment)) {
          if (!key || !value) {
            logger.warn(`Invalid environment variable: ${key}=${value}`);
          }
        }
      }
      
      logger.info('Configuration validation passed');
    })
);
```

### Schema Validation

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('before-install', async ({ toolConfig, logger }) => {
      // Custom validation logic
      const schema = {
        requiredFields: ['binaries', 'version', 'install'],
        validInstallMethods: ['github-release', 'brew', 'cargo', 'manual']
      };
      
      // Validate required fields
      for (const field of schema.requiredFields) {
        if (!toolConfig[field]) {
          throw new Error(`Required field missing: ${field}`);
        }
      }
      
      // Validate install method
      if (!schema.validInstallMethods.includes(toolConfig.install.method)) {
        throw new Error(`Invalid install method: ${toolConfig.install.method}`);
      }
      
      logger.info('Schema validation passed');
    })
);
```

## Performance Optimization

### Caching Strategies

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(`
          # Build cache once
          tool build-cache --output "${ctx.projectConfig.paths.generatedDir}/cache/tool-cache"
        `)
        .always(`
          # Use cached data
          if [[ -f "${ctx.projectConfig.paths.generatedDir}/cache/tool-cache" ]]; then
            export TOOL_CACHE_FILE="${ctx.projectConfig.paths.generatedDir}/cache/tool-cache"
          fi
        `)
    )
);
```

### Parallel Operations

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, logger }) => {
      logger.info('Running parallel setup tasks...');
      
      // Run multiple setup tasks in parallel
      const tasks = [
        $`tool setup-task-1`,
        $`tool setup-task-2`,
        $`tool setup-task-3`
      ];
      
      try {
        await Promise.all(tasks);
        logger.info('All setup tasks completed');
      } catch (error) {
        logger.error('Some setup tasks failed:', error);
        throw error;
      }
    })
);
```

## Next Steps

- [Hooks](./hooks.md) - Learn more about installation hooks
- [Common Patterns](./common-patterns.md) - See practical examples
- [Troubleshooting](./troubleshooting.md) - Debug advanced configurations