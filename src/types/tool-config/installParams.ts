import type { BrewInstallParams } from './brewInstallParamsSchema';
import type { CurlScriptInstallParams } from './curlScriptInstallParamsSchema';
import type { CurlTarInstallParams } from './curlTarInstallParamsSchema';
import type { GithubReleaseInstallParams } from './githubReleaseInstallParamsSchema';
import type { ManualInstallParams } from './manualInstallParamsSchema';

/**
 * A union type representing all possible sets of installation parameters for the different installation methods.
 */
export type InstallParams =
  | GithubReleaseInstallParams
  | BrewInstallParams
  | CurlScriptInstallParams
  | CurlTarInstallParams
  | ManualInstallParams;
