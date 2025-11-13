// @ts-nocheck
import type { GithubReleaseInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesGithubRelease = ExpectTrue<'github-release' extends InstallMethod ? true : false>;
type GithubReleaseParams = InstallParamsRegistry['github-release'];
export type GithubReleaseParamsMatchSchema = ExpectTrue<
  GithubReleaseParams extends GithubReleaseInstallParams ? true : false
>;
export type GithubReleaseSchemaMatchesParams = ExpectTrue<
  GithubReleaseInstallParams extends GithubReleaseParams ? true : false
>;
export type GithubReleaseRequiresRepo = ExpectTrue<'repo' extends keyof GithubReleaseParams ? true : false>;
export type GithubReleaseRepoIsRequired = ExpectTrue<
  Pick<GithubReleaseParams, 'repo'> extends { repo: GithubReleaseParams['repo'] } ? true : false
>;

defineTool((install) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  }).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

defineTool((install) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
    // @ts-expect-error github-release params must not accept unknown fields
    unknown: 'value',
  })
);

export const buildCheck = true;
