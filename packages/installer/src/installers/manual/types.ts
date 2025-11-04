import type { OperationFailure, OperationSuccess } from '../../types';

/**
 * Metadata for Manual installations
 */
export interface ManualInstallMetadata {
  method: 'manual';
  manualInstall: boolean;
  originalPath: string | null;
}

/**
 * Success result for Manual installations
 */
export interface ManualInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

/**
 * Result type for Manual installations
 */
export type ManualInstallResult = ManualInstallSuccess | OperationFailure;
