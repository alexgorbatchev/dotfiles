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
