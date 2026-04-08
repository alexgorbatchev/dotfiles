import type { RegisterPluginResult } from "@dotfiles/core";
import type { ManualInstallParams, ManualToolConfig } from "./schemas";
import type { ManualInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    manual: ManualInstallParams;
  }
  interface INoParamsMethodRegistry {
    manual: true;
  }
  interface IToolConfigRegistry {
    manual: ManualToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"manual", ManualInstallResult> {}
}
