import type { RegisterPluginResult } from "@dotfiles/core";
import type { BrewInstallParams, BrewToolConfig } from "./schemas";
import type { BrewInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    brew: BrewInstallParams;
  }
  interface IToolConfigRegistry {
    brew: BrewToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"brew", BrewInstallResult> {}
}
