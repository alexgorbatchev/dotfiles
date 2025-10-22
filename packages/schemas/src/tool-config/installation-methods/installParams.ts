import type { BrewInstallParams } from './brew/brewInstallParamsSchema';
import type { CurlScriptInstallParams } from './curl-script/curlScriptInstallParamsSchema';
import type { CurlTarInstallParams } from './curl-tar/curlTarInstallParamsSchema';
import type { GithubReleaseInstallParams } from './github-release/githubReleaseInstallParamsSchema';
import type { ManualInstallParams } from './manual/manualInstallParamsSchema';

/**
 * A union type representing all possible sets of installation parameters for the different installation methods.
 */
export type InstallParams =
  | GithubReleaseInstallParams
  | BrewInstallParams
  | CurlScriptInstallParams
  | CurlTarInstallParams
  | ManualInstallParams;
