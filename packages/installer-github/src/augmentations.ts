import type { RegisterPluginResult } from "@dotfiles/core";
import type { IGithubReleaseInstallParams, GithubReleaseToolConfig } from "./schemas";
import type { GitHubReleaseInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "github-release": IGithubReleaseInstallParams;
  }
  interface IToolConfigRegistry {
    "github-release": GithubReleaseToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"github-release", GitHubReleaseInstallResult> {}
}
