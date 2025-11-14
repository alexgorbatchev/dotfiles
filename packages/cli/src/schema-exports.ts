// biome-ignore-all assist/source/organizeImports: this file is used by the build process to generate the schemas.d.ts bundle.
// biome-ignore-all lint/plugin: named export required for selective API exposure

/**
 * Schema-only exports for the CLI package.
 * This file is used by the build process to generate the schemas.d.ts bundle.
 */

export { Architecture, Platform, type YamlConfig, defineConfig } from '@dotfiles/config';
export { always, once } from '@dotfiles/core';

// Re-export the defineTool function with all plugin augmentations loaded
export { defineTool } from './defineToolWithPlugins';
