import type { OperationFailure, OperationSuccess } from '../../types';

/**
 * Metadata for Curl Tar installations
 */
export interface CurlTarInstallMetadata {
  method: 'curl-tar';
  tarballUrl: string;
}

/**
 * Success result for Curl Tar installations
 */
export interface CurlTarInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlTarInstallMetadata;
}

/**
 * Result type for Curl Tar installations
 */
export type CurlTarInstallResult = CurlTarInstallSuccess | OperationFailure;
