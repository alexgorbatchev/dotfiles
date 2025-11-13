/**
 * Schema-only exports for the CLI package.
 * This file is used by the build process to generate the schemas.d.ts bundle.
 */

// biome-ignore lint/plugin: Named export required for selective API exposure
export type { Architecture, Platform, YamlConfig } from '@dotfiles/config';

// biome-ignore lint/plugin: Named export required for selective API exposure
export { always, once } from '@dotfiles/core';

// Re-export the defineTool function with all plugin augmentations loaded
// biome-ignore lint/plugin: Named export required for selective API exposure
export { defineTool } from './defineToolWithPlugins';
