import type { RegisterPluginResult } from "@dotfiles/core";
import type { ICurlBinaryInstallParams, CurlBinaryToolConfig } from "./schemas";
import type { CurlBinaryInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-binary": ICurlBinaryInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-binary": CurlBinaryToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-binary", CurlBinaryInstallResult> {}
}
