import type { CargoTomlPackage, CrateMetadata } from './CargoClient';

/**
 * Interface for a client that interacts with Cargo-related APIs.
 */
export interface ICargoClient {
  /**
   * Fetches crate metadata from crates.io API.
   * @param crateName The name of the crate.
   * @returns A promise that resolves to the crate metadata, or null if not found.
   */
  getCrateMetadata(crateName: string): Promise<CrateMetadata | null>;

  /**
   * Builds a GitHub raw URL for a Cargo.toml file.
   * @param githubRepo The GitHub repository in format "owner/repo".
   * @param branch The branch name (defaults to "main").
   * @returns The constructed URL.
   */
  buildCargoTomlUrl(githubRepo: string, branch?: string): string;

  /**
   * Fetches and parses a Cargo.toml file from a URL.
   * @param url The URL to the Cargo.toml file.
   * @returns A promise that resolves to the parsed package section, or null if not found.
   */
  getCargoTomlPackage(url: string): Promise<CargoTomlPackage | null>;

  /**
   * Gets the latest version of a crate from crates.io.
   * @param crateName The name of the crate.
   * @returns A promise that resolves to the version string, or null if not found.
   */
  getLatestVersion(crateName: string): Promise<string | null>;
}
