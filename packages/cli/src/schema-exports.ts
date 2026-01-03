// biome-ignore-all assist/source/organizeImports: this file is used by the build process to generate the schemas.d.ts bundle.
// biome-ignore-all lint/plugin: named export required for selective API exposure

// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================
export { Architecture, defineConfig, Platform } from '@dotfiles/config';
export { dedentString, dedentTemplate } from '@dotfiles/utils';
export { defineTool } from './defineToolWithPlugins';

// ============================================================================
// FOR BUILD PURPOSES ONLY
// ============================================================================
export * from './build-only-types';
