export * from './base';
export * from './baseToolConfigWithPlatformsSchema';
export * from './hooks';
export * from './platformConfigEntrySchema';
export * from './shell';
export * from './toolConfigUpdateCheckSchema';

/**
 * NOTE: Builder types (IToolConfigBuilder, AsyncConfigureTool, etc.) and PlatformConfig
 * have been moved to @dotfiles/core package to avoid circular dependencies.
 *
 * Import them directly from '@dotfiles/core' instead:
 * ```typescript
 * import type { AsyncConfigureTool, IToolConfigBuilder } from '@dotfiles/core';
 * ```
 */
