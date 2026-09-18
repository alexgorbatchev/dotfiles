import {
  defineTool,
  type z_internal_GithubReleaseInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

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

// assetSelector is a callback: it is given the release's assets and must return one of
// them, or nothing.
defineTool((install) =>
  install("github-release", {
    repo: "owner/tool",
    assetSelector: ({ assets, release, assetPattern }) => {
      expectType<string>(release.tag_name);
      expectType<boolean>(release.prerelease);
      expectType<string | undefined>(assetPattern);
      return assets.find((asset) => asset.name.endsWith(".tar.gz"));
    },
  }).bin("tool"),
);

// An async selector is awaited.
defineTool((install) =>
  install("github-release", {
    repo: "owner/tool",
    assetSelector: async ({ assets }) => assets[0],
  }).bin("tool"),
);

// A pattern string is not a selector: the two parameters are separate, and passing one
// where the other belongs used to silently change which asset was installed.
expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "owner/tool",
      assetSelector: "*.tar.gz",
    }),
  ),
);

// A selector must return an asset of the release, not a name.
expectError(() =>
  defineTool((install) =>
    install("github-release", {
      repo: "owner/tool",
      assetSelector: ({ assets }) => assets[0]?.name,
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
