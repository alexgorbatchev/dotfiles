/**
 * @file generator/src/modules/github-client/index.ts
 * @description Barrel file for the GitHub API Client module.
 *
 * This module provides an interface and implementation for interacting
 * with the GitHub API, specifically for fetching release information.
 */

export * from './IGitHubApiClient';
export * from './GitHubApiClient';
export * from './GitHubApiClientError';
export type { GitHubRelease, GitHubRateLimit } from '../../types';
