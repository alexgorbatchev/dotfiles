import type { RegisterPluginResult } from "@dotfiles/core";
import type { ICurlTarInstallParams, CurlTarToolConfig } from "./schemas";
import type { CurlTarInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-tar": ICurlTarInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-tar": CurlTarToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-tar", CurlTarInstallResult> {}
}
