import { z } from 'zod';
import { baseInstallParamsSchema } from './baseInstallParamsSchema';

/**
 * Zod schema for Cargo installation parameters
 */
export const cargoInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The crate name
   */
  crateName: z.string(),

  /**
   * Source for binaries - either cargo-quickinstall or GitHub releases
   */
  binarySource: z.enum(['cargo-quickinstall', 'github-releases']).optional(),

  /**
   * GitHub repository for the crate (required for github-releases source)
   * Format: "owner/repo"
   */
  githubRepo: z.string().optional(),

  /**
   * Asset pattern for GitHub releases
   * Supports placeholders: {version}, {platform}, {arch}, {crateName}
   */
  assetPattern: z.string().optional(),

  /**
   * Version source - where to get the version information
   */
  versionSource: z.enum(['cargo-toml', 'crates-io', 'github-releases']).optional(),

  /**
   * Custom Cargo.toml URL if different from standard GitHub location
   */
  cargoTomlUrl: z.string().optional(),

  /**
   * Custom binary names if different from crate name
   */
  customBinaries: z.array(z.string()).optional(),

  /**
   * Whether to fallback to source compilation if binary not available
   */
  allowSourceFallback: z.boolean().optional(),
});
