/**
 * defineTool with plugin types pre-loaded.
 *
 * This file explicitly imports all plugins to ensure their module augmentations
 * are loaded before exporting defineTool. This guarantees that IInstallParamsRegistry
 * is populated with all plugin types.
 */

//
// CRITICAL: Import plugins FIRST to load module augmentations
// import '@dotfiles/core/plugins';

// Now export defineTool with fully populated types
export { createInstallFunction, defineTool } from "./defineTool";
