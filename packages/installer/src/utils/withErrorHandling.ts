import type { TsLogger } from "@dotfiles/logger";
import type { InstallResult } from "../types";
import { extractErrorCause } from "./extractErrorCause";
import { messages } from "./log-messages";

type ErrorHandledOperation<T extends InstallResult> = () => Promise<T>;

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
  operation: ErrorHandledOperation<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(messages.outcome.installFailed(methodName), error);
    return {
      success: false,
      error: extractErrorCause(error),
    } as T;
  }
}
