import type { RegisterPluginResult } from "@dotfiles/core";
import type { IPkgInstallParams, PkgToolConfig } from "./schemas";
import type { PkgInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    pkg: IPkgInstallParams;
  }

  interface IToolConfigRegistry {
    pkg: PkgToolConfig;
  }

  interface IPluginResultRegistry extends RegisterPluginResult<"pkg", PkgInstallResult> {}
}
