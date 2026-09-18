import {
  defineTool,
  type z_internal_GithubReleaseInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type GithubReleaseInstallParams = z_internal_GithubReleaseInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type GithubReleaseParams = InstallParamsRegistry["github-release"];
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

// Every parameter the Go installer reads.
defineTool((install) =>
  install("github-release", {
    repo: "owner/tool",
    version: "v2.1.0",
    assetPattern: "*linux*amd64*.tar.gz",
    ghCli: true,
    token: "ghp_example",
    prerelease: true,
    auto: true,
  }).bin("tool"),
);

// A RegExp pattern is serialised as a slash-delimited regex the Go matcher understands.
defineTool((install) =>
  install("github-release", {
    repo: "oven-sh/bun",
    assetPattern: /^(?!.*-profile).*\.zip$/,
  }).bin("bun"),
);

expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "BurntSushi/ripgrep",
      unknown: "value",
    }),
  ),
);

// Asset selection is pattern-only: the runtime has no selector callback.
type ReleaseAsset = { name: string };
type AssetSelection = { assets: ReleaseAsset[] };
expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "owner/tool",
      assetSelector: ({ assets }: AssetSelection) => assets[0],
    }),
  ),
);

// The API host comes from the project configuration (`github.host`), not per tool.
expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "owner/tool",
      githubHost: "https://github.example.com/api/v3",
    }),
  ),
);

// Only curl-script passes `env` through to what it runs.
expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "owner/tool",
      env: { CUSTOM_FLAG: "true" },
    }),
  ),
);
