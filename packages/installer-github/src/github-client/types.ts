import type { IGitHubRateLimit, IGitHubRelease } from "@dotfiles/core";

export interface IGitHubReleaseQueryOptions {
  perPage?: number;
  includePrerelease?: boolean;
  limit?: number;
}

export interface IReleaseSelectionResult {
  release: IGitHubRelease | null;
  version: string | null;
}

export interface IGitHubRateLimitResources {
  core: IGitHubRateLimit;
  search: IGitHubRateLimit;
  graphql: IGitHubRateLimit;
  integration_manifest: IGitHubRateLimit;
  source_import: IGitHubRateLimit;
  code_scanning_upload: IGitHubRateLimit;
  actions_runner_registration: IGitHubRateLimit;
  scim: IGitHubRateLimit;
}

export interface IGitHubRateLimitResponse {
  resources: IGitHubRateLimitResources;
  rate: IGitHubRateLimit;
}
