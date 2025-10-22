import type { TsLogger } from '@dotfiles/logger';
import type { InstallResult } from '../types';
import { installerLogMessages } from './log-messages';

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(installerLogMessages.outcome.installFailed(methodName, toolName, errorMessage));
    return {
      success: false,
      error: errorMessage,
    };
  }
}
