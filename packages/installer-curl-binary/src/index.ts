export * from "./CurlBinaryInstallerPlugin";
export * from "./installFromCurlBinary";
export * from "./schemas";
export * from "./types";

// Module augmentation for curl-binary plugin
import type { RegisterPluginResult } from "@dotfiles/core";
import type { CurlBinaryInstallParams, CurlBinaryToolConfig } from "./schemas";
import type { CurlBinaryInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-binary": CurlBinaryInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-binary": CurlBinaryToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-binary", CurlBinaryInstallResult> {}
}
