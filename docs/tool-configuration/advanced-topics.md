# Advanced Topics

This section covers advanced configuration patterns and techniques for complex tool setups.

## Custom Asset Selection

For complex release patterns, implement custom asset selectors to handle non-standard naming conventions:

```typescript
c.install('github-release', {
  repo: 'owner/tool',
  assetSelector: (assets, systemInfo) => {
    // Custom logic to select the right asset
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
    
    return assets.find(asset => 
      asset.name.toLowerCase().includes(osKey) &&
      asset.name.toLowerCase().includes(archKey) &&
      asset.name.endsWith('.tar.gz')
    );
  }
})
```

### Asset Selector Use Cases

**Complex Naming Schemes:**
```typescript
// Handle assets with inconsistent naming
assetSelector: (assets, sysInfo) => {
  const patterns = [
    `${sysInfo.platform}-${sysInfo.arch}`,
    `${sysInfo.platform}_${sysInfo.arch}`,
    sysInfo.platform === 'darwin' ? 'macos' : sysInfo.platform
  ];
  
  return assets.find(asset => 
    patterns.some(pattern => asset.name.includes(pattern))
  );
}
```

**Version-Specific Logic:**
```typescript
// Different asset patterns for different versions
assetSelector: (assets, sysInfo) => {
  const version = assets[0]?.tag_name || '';
  
  if (version.startsWith('v2.')) {
    // v2.x uses new naming scheme
    return assets.find(asset => 
      asset.name.includes(`${sysInfo.platform}-${sysInfo.arch}`)
    );
  } else {
    // v1.x uses old naming scheme
    return assets.find(asset => 
      asset.name.includes(`${sysInfo.platform}_${sysInfo.arch}`)
    );
  }
}
```

## Dynamic Configuration

Use environment variables or system detection for runtime configuration:

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  const version = process.env.TOOL_VERSION || 'latest';
  const enableFeature = process.env.ENABLE_FEATURE === 'true';
  
  c
    .bin('tool')
    .version(version)
    .install('github-release', { repo: 'owner/tool' });
    
  if (enableFeature) {
    c.zsh({
      // Use declarative configuration for environment variables
      environment: {
        'TOOL_FEATURE_ENABLED': '1'
      }
    });
  }
};
```

### Environment-Based Configuration

**Development vs Production:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  const isDev = process.env.NODE_ENV === 'development';
  
  c
    .bin('tool')
    .version(isDev ? 'latest' : 'v1.2.3')  // Use stable version in production
    .install('github-release', { repo: 'owner/tool' })
    .zsh({
      environment: {
        'TOOL_LOG_LEVEL': isDev ? 'debug' : 'info'
      }
    });
};
```

**User-Specific Configuration:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  const userPrefs = {
    theme: process.env.TOOL_THEME || 'dark',
    editor: process.env.EDITOR || 'vim'
  };
  
  c
    .bin('tool')
    .install('github-release', { repo: 'owner/tool' })
    .zsh({
      environment: {
        'TOOL_THEME': userPrefs.theme,
        'TOOL_EDITOR': userPrefs.editor
      }
    });
};
```

## Conditional Installation Methods

Choose installation methods based on system capabilities:

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // Check if Homebrew is available on macOS
  c.platform(Platform.MacOS, (c) => {
    if (process.env.HOMEBREW_PREFIX) {
      c.install('brew', { formula: 'tool' });
    } else {
      c.install('github-release', { repo: 'owner/tool' });
    }
  });
  
  // Use package manager on Linux if available
  c.platform(Platform.Linux, (c) => {
    if (process.env.DEBIAN_FRONTEND) {
      // Debian/Ubuntu system - could use apt
      c.install('github-release', { repo: 'owner/tool' });
    } else {
      c.install('github-release', { repo: 'owner/tool' });
    }
  });
};
```

## Complex Hook Patterns

### Multi-Stage Build Process

```typescript
c.hooks({
  afterExtract: async ({ extractDir, installDir, logger, $ }) => {
    if (extractDir) {
      logger.info('Starting multi-stage build...');
      
      // Stage 1: Configure
      await $`cd ${extractDir} && ./configure --prefix=${installDir}`;
      
      // Stage 2: Build
      await $`cd ${extractDir} && make -j$(nproc)`;
      
      // Stage 3: Install
      await $`cd ${extractDir} && make install`;
      
      logger.info('Multi-stage build completed');
    }
  }
})
```

### Dependency Management

```typescript
c.hooks({
  beforeInstall: async ({ systemInfo, logger, $ }) => {
    logger.info('Checking dependencies...');
    
    // Check for required dependencies
    const deps = ['git', 'curl', 'tar'];
    for (const dep of deps) {
      try {
        await $`command -v ${dep}`;
        logger.info(`✓ ${dep} found`);
      } catch {
        throw new Error(`Required dependency not found: ${dep}`);
      }
    }
  },
  
  afterInstall: async ({ toolName, installDir, logger, $ }) => {
    // Verify installation
    const binaryPath = path.join(installDir, toolName);
    try {
      const result = await $`${binaryPath} --version`;
      logger.info(`✓ ${toolName} installed successfully: ${result.stdout.trim()}`);
    } catch (error) {
      throw new Error(`Installation verification failed: ${error.message}`);
    }
  }
})
```

## Advanced Shell Integration

### Lazy Loading Functions

```typescript
import { always } from '@types';

c.zsh({
  shellInit: [
    always/* zsh */`
      # Lazy load expensive functions
      function expensive-tool-function() {
        # Undefine this function
        unfunction expensive-tool-function
        
        # Load the real implementation
        source "${ctx.toolDir}/expensive-functions.zsh"
        
        # Call the real function
        expensive-tool-function "$@"
      }
    `
  ]
})
```

### Dynamic Completion Loading

```typescript
import { once, always } from '@types';

c.zsh({
  shellInit: [
    once/* zsh */`
      # Generate completions once
      if [[ ! -f "${ctx.generatedDir}/completions/_tool" ]]; then
        tool completion zsh > "${ctx.generatedDir}/completions/_tool"
      fi
    `,
    always/* zsh */`
      # Load completions dynamically
      if [[ -f "${ctx.generatedDir}/completions/_tool" ]]; then
        source "${ctx.generatedDir}/completions/_tool"
      fi
    `
  ]
})
```

### Context-Aware Configuration

```typescript
import { always } from '@types';

c.zsh({
  shellInit: [
    always/* zsh */`
      # Different behavior based on context
      function smart-tool() {
        if [[ -f ./.tool-config ]]; then
          # Project-specific configuration
          tool --config ./.tool-config "$@"
        elif [[ -f "${ctx.homeDir}/.config/tool/config.toml" ]]; then
          # User configuration
          tool --config "${ctx.homeDir}/.config/tool/config.toml" "$@"
        else
          # Default behavior
          tool "$@"
        fi
      }
    `
  ]
})
```

## Version Management

### Multiple Version Support

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  const versions = ['v1.0.0', 'v2.0.0', 'latest'];
  const defaultVersion = process.env.TOOL_DEFAULT_VERSION || 'latest';
  
  // Install default version
  c
    .bin('tool')
    .version(defaultVersion)
    .install('github-release', { repo: 'owner/tool' });
  
  // Add version switching function
  c.zsh({
    shellInit: [
      always/* zsh */`
        function tool-switch-version() {
          local version=\${1:-${defaultVersion}}
          local tool_path="${ctx.toolDir}/\$version/bin/tool"
          
          if [[ -f "\$tool_path" ]]; then
            export TOOL_VERSION="\$version"
            export PATH="${ctx.toolDir}/\$version/bin:\$PATH"
            echo "Switched to tool version \$version"
          else
            echo "Version \$version not found"
            return 1
          fi
        }
      `
    ]
  });
};
```

## Configuration Validation

### Runtime Validation

```typescript
c.hooks({
  afterInstall: async ({ toolConfig, logger }) => {
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
  }
})
```

### Schema Validation

```typescript
c.hooks({
  beforeInstall: async ({ toolConfig, logger }) => {
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
  }
})
```

## Performance Optimization

### Caching Strategies

```typescript
import { once, always } from '@types';

c.zsh({
  shellInit: [
    once/* zsh */`
      # Build cache once
      tool build-cache --output "${ctx.generatedDir}/cache/tool-cache"
    `,
    always/* zsh */`
      # Use cached data
      if [[ -f "${ctx.generatedDir}/cache/tool-cache" ]]; then
        export TOOL_CACHE_FILE="${ctx.generatedDir}/cache/tool-cache"
      fi
    `
  ]
})
```

### Parallel Operations

```typescript
c.hooks({
  afterInstall: async ({ $, logger }) => {
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
  }
})
```

## Next Steps

- [Hooks](./hooks.md) - Learn more about installation hooks
- [Common Patterns](./common-patterns.md) - See practical examples
- [Troubleshooting](./troubleshooting.md) - Debug advanced configurations