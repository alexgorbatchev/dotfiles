import type { RegisterPluginResult } from "@dotfiles/core";
import type { ICurlScriptInstallParams, CurlScriptToolConfig } from "./schemas";
import type { CurlScriptInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-script": ICurlScriptInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-script": CurlScriptToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-script", CurlScriptInstallResult> {}
}
