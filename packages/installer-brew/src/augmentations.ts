import type { RegisterPluginResult } from "@dotfiles/core";
import type { IBrewInstallParams, BrewToolConfig } from "./schemas";
import type { BrewInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    brew: IBrewInstallParams;
  }
  interface IToolConfigRegistry {
    brew: BrewToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"brew", BrewInstallResult> {}
}
