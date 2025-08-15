import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { InstallResult } from '../IInstaller';

/**
 * Wraps installation operations with consistent error handling
 * Extracted from duplicated error handling across all installation methods
 */
export async function withInstallErrorHandling<T>(
  methodName: string,
  toolName: string,
  logger: TsLogger,
  operation: () => Promise<T>
): Promise<T | InstallResult> {
  try {
    return await operation();
  } catch (error) {
    logger.error(logs.tool.error.installFailed(methodName, toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
