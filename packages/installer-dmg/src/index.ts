export * from "./DmgInstallerPlugin";
export * from "./installFromDmg";
export * from "./schemas";
export * from "./types";

// Module augmentation for dmg plugin
import type { RegisterPluginResult } from "@dotfiles/core";
import type { DmgInstallParams, DmgToolConfig } from "./schemas";
import type { DmgInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    dmg: DmgInstallParams;
  }
  interface IToolConfigRegistry {
    dmg: DmgToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"dmg", DmgInstallResult> {}
}
