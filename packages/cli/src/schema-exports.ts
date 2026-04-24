// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================
export { Architecture, defineConfig, Platform } from "@dotfiles/config";
export type * from "@dotfiles/config";
export type * from "@dotfiles/core";
export { dedentString, dedentTemplate } from "@dotfiles/utils";
export { defineTool } from "./defineToolWithPlugins";

// ============================================================================
// FOR BUILD PURPOSES ONLY
// ============================================================================
export * from "./build-only-types";
