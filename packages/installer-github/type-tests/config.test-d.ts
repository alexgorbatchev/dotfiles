import {
  defineTool,
  type z_internal_GithubReleaseInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type GithubReleaseInstallParams = z_internal_GithubReleaseInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type GithubReleaseParams = IInstallParamsRegistry["github-release"];
export type InstallIncludesGithubRelease = ExpectTrue<"github-release" extends InstallMethod ? true : false>;
export type GithubReleaseParamsMatchSchema = ExpectTrue<
  GithubReleaseParams extends GithubReleaseInstallParams ? true : false
>;
export type GithubReleaseSchemaMatchesParams = ExpectTrue<
  GithubReleaseInstallParams extends GithubReleaseParams ? true : false
>;
export type GithubReleaseRequiresRepo = ExpectTrue<"repo" extends keyof GithubReleaseParams ? true : false>;
export type GithubReleaseRepoIsRequired = ExpectTrue<
  Pick<GithubReleaseParams, "repo"> extends { repo: GithubReleaseParams["repo"] } ? true : false
>;

defineTool((install) =>
  install("github-release", {
    repo: "BurntSushi/ripgrep",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "BurntSushi/ripgrep",
      unknown: "value",
    }),
  ),
);
