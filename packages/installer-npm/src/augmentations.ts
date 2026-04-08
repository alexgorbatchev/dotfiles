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
