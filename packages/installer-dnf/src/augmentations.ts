import type { RegisterPluginResult } from "@dotfiles/core";
import type { IDnfInstallParams, DnfToolConfig } from "./schemas";
import type { DnfInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    dnf: IDnfInstallParams;
  }

  interface IToolConfigRegistry {
    dnf: DnfToolConfig;
  }

  interface IPluginResultRegistry extends RegisterPluginResult<"dnf", DnfInstallResult> {}
}
