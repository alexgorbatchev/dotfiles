import type { TsLogger } from '@dotfiles/logger';
import type { InstallResult } from '../types';
import { messages } from './log-messages';

/**
 * Wraps installation operations with consistent error handling and logging.
 * Catches any errors thrown by the operation and converts them to failed InstallResult.
 *
 * Ensures all installation methods have uniform error handling:
 * - Catches exceptions from async operations
 * - Logs error with method and tool context
 * - Returns failed InstallResult with error message
 * - Preserves original error details when available
 *
 * @param methodName - Installation method name for logging (e.g., 'github-release', 'brew')
 * @param _toolName - Name of tool being installed (reserved for future use)
 * @param logger - Logger for error messages
 * @param operation - Async function that performs installation and returns InstallResult
 * @returns InstallResult from operation, or failure result if operation throws
 */
export async function withInstallErrorHandling<T extends InstallResult>(
  methodName: string,
  _toolName: string,
  logger: TsLogger,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(messages.outcome.installFailed(methodName), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } as T;
  }
}
