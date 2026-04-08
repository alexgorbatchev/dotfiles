export * from "./CurlScriptInstallerPlugin";
export * from "./installFromCurlScript";
export * from "./schemas";
export * from "./types";

// Module augmentation for curl-script plugin
import type { RegisterPluginResult } from "@dotfiles/core";
import type { CurlScriptInstallParams, CurlScriptToolConfig } from "./schemas";
import type { CurlScriptInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-script": CurlScriptInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-script": CurlScriptToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-script", CurlScriptInstallResult> {}
}
