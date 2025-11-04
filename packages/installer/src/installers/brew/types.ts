import type { OperationFailure, OperationSuccess } from '../../types';

/**
 * Metadata for Homebrew installations
 */
export interface BrewInstallMetadata {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

/**
 * Success result for Homebrew installations
 */
export interface BrewInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version?: string;
  metadata: BrewInstallMetadata;
}

/**
 * Result type for Brew installations
 */
export type BrewInstallResult = BrewInstallSuccess | OperationFailure;
