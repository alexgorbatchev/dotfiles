// Export builder types and API
export * from './builder';

// TODO remove as Builder
export * as Builder from './builder';

// Export all schema types from organized subdirectories
export * from './common';
export * from './config';
export * from './InstallerPluginRegistry';
export * from './installer';
export * from './platformConfigSchema';
export * from './shell';
export * from './tool-config';
export * from './types';

// CRITICAL: Import plugins LAST to load type augmentations
// This ensures all core exports are available BEFORE plugins try to import them
// The plugins extend InstallParamsRegistry and ToolConfigRegistry via module augmentation
import './plugins';
