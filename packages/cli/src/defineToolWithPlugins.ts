/**
 * defineTool with plugin types pre-loaded.
 *
 * This file explicitly imports all plugins to ensure their module augmentations
 * are loaded before exporting defineTool. This guarantees that InstallParamsRegistry
 * is populated with all plugin types.
 */

// CRITICAL: Import plugins FIRST to load module augmentations
import '../../installer-brew/src/index';
import '../../installer-cargo/src/index';
import '../../installer-curl-script/src/index';
import '../../installer-curl-tar/src/index';
import '../../installer-github/src/index';
import '../../installer-manual/src/index';

// Now export defineTool with fully populated types
// biome-ignore lint/plugin: Named exports required for selective API exposure
export { createInstallFunction, defineTool } from './defineTool';
