import type { OperationFailure, OperationSuccess } from '../../types';

/**
 * Metadata for Cargo installations
 */
export interface CargoInstallMetadata {
  method: 'cargo';
  crateName: string;
  binarySource: string;
  downloadUrl?: string;
}

/**
 * Success result for Cargo installations
 */
export interface CargoInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: CargoInstallMetadata;
}

/**
 * Result type for Cargo installations
 */
export type CargoInstallResult = CargoInstallSuccess | OperationFailure;
