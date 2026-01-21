/**
 * defineTool with plugin types pre-loaded.
 *
 * This file explicitly imports all plugins to ensure their module augmentations
 * are loaded before exporting defineTool. This guarantees that IInstallParamsRegistry
 * is populated with all plugin types.
 */

// CRITICAL: Import plugins FIRST to load module augmentations
/* oxlint-disable import/no-unassigned-import */
import '@dotfiles/installer-brew';
import '@dotfiles/installer-cargo';
import '@dotfiles/installer-curl-script';
import '@dotfiles/installer-curl-tar';
import '@dotfiles/installer-github';
import '@dotfiles/installer-manual';
/* oxlint-enable import/no-unassigned-import */

// Now export defineTool with fully populated types
export { createInstallFunction, defineTool } from './defineTool';
