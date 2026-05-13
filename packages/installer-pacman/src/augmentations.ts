import type { RegisterPluginResult } from "@dotfiles/core";
import type { IPacmanInstallParams, PacmanToolConfig } from "./schemas";
import type { PacmanInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    pacman: IPacmanInstallParams;
  }

  interface IToolConfigRegistry {
    pacman: PacmanToolConfig;
  }

  interface IPluginResultRegistry extends RegisterPluginResult<"pacman", PacmanInstallResult> {}
}
