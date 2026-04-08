import type { RegisterPluginResult } from "@dotfiles/core";
import type { GithubReleaseInstallParams, GithubReleaseToolConfig } from "./schemas";
import type { GitHubReleaseInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "github-release": GithubReleaseInstallParams;
  }
  interface IToolConfigRegistry {
    "github-release": GithubReleaseToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"github-release", GitHubReleaseInstallResult> {}
}
