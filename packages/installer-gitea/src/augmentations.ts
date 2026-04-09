import type { RegisterPluginResult } from "@dotfiles/core";
import type { IGiteaReleaseInstallParams, GiteaReleaseToolConfig } from "./schemas";
import type { GiteaReleaseInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "gitea-release": IGiteaReleaseInstallParams;
  }
  interface IToolConfigRegistry {
    "gitea-release": GiteaReleaseToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"gitea-release", GiteaReleaseInstallResult> {}
}
