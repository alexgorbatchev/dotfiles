/**
 * Type definitions for the mock server builder.
 *
 * These types define the configuration interfaces for mocking GitHub releases,
 * Cargo crates, and script endpoints in e2e tests.
 */

/**
 * Version configuration for a single release version of a tool.
 * Maps architecture patterns to asset filenames.
 */
export interface IVersionAssets {
  /** Version string (e.g., "1.0.0", "2.0.0") */
  version: string;
  /** Map of architecture regex patterns to asset filenames */
  assets: Record<string, string>;
}

/**
 * Configuration for a GitHub release tool mock.
 */
export interface IGitHubToolConfig {
  /** Repository name in "org/repo" format */
  repo: string;
  /** Directory within fixtures where tool assets are stored */
  toolDir: string;
  /** Version to return by default from /releases/latest */
  defaultVersion: string;
  /** All available versions and their assets */
  versions: ReadonlyArray<IVersionAssets>;
}

/**
 * Configuration for a Cargo crate mock.
 */
export interface ICargoToolConfig {
  /** Crate name */
  crateName: string;
  /** Directory within fixtures where tool assets are stored */
  toolDir: string;
  /** Default version to return */
  defaultVersion: string;
  /** Map of version strings to architecture/asset mappings */
  versions: Record<string, Record<string, string>>;
}

/**
 * Configuration for a script endpoint mock.
 */
export interface IScriptConfig {
  /** URL path to serve the script at (e.g., "/mock-install.sh") */
  path: string;
  /** Path to the script file relative to fixtures directory */
  fixturePath: string;
  /** Content-Type header (defaults to "application/x-sh") */
  contentType?: string;
}

/**
 * Configuration for a tar.gz endpoint mock.
 */
export interface ITarConfig {
  /** URL path to serve the tarball at */
  path: string;
  /** Path to the tarball file relative to fixtures directory */
  fixturePath: string;
}

/**
 * Combined configuration for the mock server.
 */
export interface IMockServerConfig {
  /** Fixture directory path (relative to test dir) */
  fixtureDir: string;
  /** GitHub tool configurations */
  githubTools: IGitHubToolConfig[];
  /** Cargo tool configurations */
  cargoTools: ICargoToolConfig[];
  /** Script endpoint configurations */
  scripts: IScriptConfig[];
  /** Tarball endpoint configurations */
  tarballs: ITarConfig[];
}
