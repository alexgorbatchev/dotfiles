import type { TsLogger } from '@dotfiles/logger';
import type { InstallResult } from '../types';
import { messages } from './log-messages';

/**
 * Wraps installation operations with consistent error handling
 * Extracted from duplicated error handling across all installation methods
 */
export async function withInstallErrorHandling<T extends InstallResult>(
  methodName: string,
  toolName: string,
  logger: TsLogger,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(messages.outcome.installFailed(methodName, toolName), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } as T;
  }
}
