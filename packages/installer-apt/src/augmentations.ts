import type { RegisterPluginResult } from "@dotfiles/core";
import type { IAptInstallParams, AptToolConfig } from "./schemas";
import type { AptInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    apt: IAptInstallParams;
  }

  interface IToolConfigRegistry {
    apt: AptToolConfig;
  }

  interface IPluginResultRegistry extends RegisterPluginResult<"apt", AptInstallResult> {}
}
