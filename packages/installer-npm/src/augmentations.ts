import type { RegisterPluginResult } from "@dotfiles/core";
import type { INpmInstallParams, NpmToolConfig } from "./schemas";
import type { NpmInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    npm: INpmInstallParams;
  }
  interface IToolConfigRegistry {
    npm: NpmToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"npm", NpmInstallResult> {}
}
