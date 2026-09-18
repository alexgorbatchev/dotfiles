import {
  defineTool,
  type z_internal_GiteaReleaseInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type GiteaReleaseInstallParams = z_internal_GiteaReleaseInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type GiteaReleaseParams = InstallParamsRegistry["gitea-release"];
export type InstallIncludesGiteaRelease = ExpectTrue<"gitea-release" extends InstallMethod ? true : false>;
export type GiteaReleaseParamsMatchSchema = ExpectTrue<
  GiteaReleaseParams extends GiteaReleaseInstallParams ? true : false
>;
export type GiteaReleaseSchemaMatchesParams = ExpectTrue<
  GiteaReleaseInstallParams extends GiteaReleaseParams ? true : false
>;
export type GiteaReleaseRequiresRepo = ExpectTrue<"repo" extends keyof GiteaReleaseParams ? true : false>;
export type GiteaReleaseRepoIsRequired = ExpectTrue<
  Pick<GiteaReleaseParams, "repo"> extends { repo: GiteaReleaseParams["repo"] } ? true : false
>;
export type GiteaReleaseRequiresInstanceUrl = ExpectTrue<"instanceUrl" extends keyof GiteaReleaseParams ? true : false>;
export type GiteaReleaseInstanceUrlIsRequired = ExpectTrue<
  Pick<GiteaReleaseParams, "instanceUrl"> extends { instanceUrl: GiteaReleaseParams["instanceUrl"] } ? true : false
>;

defineTool((install) =>
  install("gitea-release", {
    instanceUrl: "https://codeberg.org",
    repo: "Codeberg/pages-server",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

// Every parameter the Go installer reads.
defineTool((install) =>
  install("gitea-release", {
    instanceUrl: "https://gitea.example.com",
    repo: "org/private-tool",
    assetPattern: /tool-v\d+.*linux/,
    token: process.env.GITEA_TOKEN,
    auto: true,
  }).bin("tool"),
);

expectError(() =>
  defineTool((install) =>
    install("gitea-release", {
      instanceUrl: "https://codeberg.org",
      repo: "Codeberg/pages-server",
      unknown: "value",
    }),
  ),
);

// The release is chosen with .version(); prereleases and selector callbacks are not
// part of the Gitea installer.
expectError(() =>
  defineTool((install) =>
    install("gitea-release", { instanceUrl: "https://codeberg.org", repo: "owner/tool", version: "v2.1.0" }),
  ),
);
expectError(() =>
  defineTool((install) =>
    install("gitea-release", { instanceUrl: "https://codeberg.org", repo: "owner/tool", prerelease: true }),
  ),
);
