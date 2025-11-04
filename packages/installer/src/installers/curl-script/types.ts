import type { OperationFailure, OperationSuccess } from '../../types';

/**
 * Metadata for Curl Script installations
 */
export interface CurlScriptInstallMetadata {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

/**
 * Success result for Curl Script installations
 */
export interface CurlScriptInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlScriptInstallMetadata;
}

/**
 * Result type for Curl Script installations
 */
export type CurlScriptInstallResult = CurlScriptInstallSuccess | OperationFailure;
