export * from "./installFromNpm";
export * from "./NpmInstallerPlugin";
export * from "./schemas";
export * from "./types";

// Module augmentation for npm plugin
import type { RegisterPluginResult } from "@dotfiles/core";
import type { NpmInstallParams, NpmToolConfig } from "./schemas";
import type { NpmInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    npm: NpmInstallParams;
  }
  interface IToolConfigRegistry {
    npm: NpmToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"npm", NpmInstallResult> {}
}
