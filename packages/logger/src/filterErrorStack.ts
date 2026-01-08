/**
 * Filters an error's stack trace to only include .tool.ts frames.
 * This provides cleaner output for end users by hiding internal framework details.
 */

const TOOL_FILE_PATTERN = /\.tool\.(ts|js)/;

/**
 * Checks if a stack frame is from a .tool.ts file.
 */
function isToolFrame(frameLine: string): boolean {
  return TOOL_FILE_PATTERN.test(frameLine);
}

/**
 * Extracts the first .tool.ts frame from a stack trace string.
 * Returns null if no .tool.ts frame is found.
 */
function extractFirstToolFrame(stack: string): string | null {
  const lines = stack.split('\n');

  for (const line of lines) {
    if (isToolFrame(line)) {
      return line.trim();
    }
  }

  return null;
}

/**
 * Creates a filtered stack trace containing only .tool.ts frames.
 * If no .tool.ts frames are found, returns null.
 */
export function filterStackToToolFiles(stack: string | undefined): string | null {
  if (!stack) {
    return null;
  }

  const toolFrame = extractFirstToolFrame(stack);
  return toolFrame;
}

/**
 * Filters an Error object's stack to only include .tool.ts frames.
 * Creates a new Error with the filtered stack, preserving the original message.
 *
 * @param error - The error to filter
 * @returns A new Error with filtered stack, or the original if no filtering needed
 */
export function filterErrorStackToToolFiles(error: Error): Error {
  // Handle errors that might not have a standard stack property
  const stack = typeof error.stack === 'string' ? error.stack : undefined;
  const filteredStack = filterStackToToolFiles(stack);

  // Get message safely - some error types (like ShellError) may not have standard message
  const message = error.message ?? String(error);
  const name = error.name ?? 'Error';

  if (!filteredStack) {
    // No .tool.ts frames found, create error with just message (no stack)
    const filteredError = new Error(message);
    filteredError.name = name;
    filteredError.stack = `${name}: ${message}`;
    return filteredError;
  }

  // Create new error with filtered stack
  const filteredError = new Error(message);
  filteredError.name = name;
  filteredError.stack = `${name}: ${message}\n    ${filteredStack}`;
  return filteredError;
}

/**
 * Type guard to check if a value is an Error object.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
