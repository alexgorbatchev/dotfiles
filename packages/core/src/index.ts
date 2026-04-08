// Export builder types and API
export * from "./builder";

// Export all schema types from organized subdirectories
export * from "./common";
export * from "./config";
export * from "./context";
export * from "./installer";
export * from "./InstallerPluginRegistry";
export * from "./platformConfigSchema";
export * from "./shell";
export * from "./tool-config";
export * from "./types";

// CRITICAL: Import plugins LAST to load type augmentations
// This ensures all core exports are available BEFORE plugins try to import them
// The plugins extend IInstallParamsRegistry and IToolConfigRegistry via module augmentation
// oxlint-disable-next-line import/no-unassigned-import
import "./plugins";
