import type { RegisterPluginResult } from "@dotfiles/core";
import type { IDmgInstallParams, DmgToolConfig } from "./schemas";
import type { DmgInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    dmg: IDmgInstallParams;
  }
  interface IToolConfigRegistry {
    dmg: DmgToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"dmg", DmgInstallResult> {}
}
