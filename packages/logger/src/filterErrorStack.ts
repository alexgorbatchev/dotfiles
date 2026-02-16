const TOOL_FILE_PATTERN = /\.tool\.(ts|js)/;

/**
 * Regex to extract filename and line number from a stack frame.
 * Matches patterns like: `at fn (/path/to/file.tool.ts:14:13)`
 * Captures: [1] = filename (e.g. `flux.tool.ts`), [2] = line number
 */
const FRAME_LOCATION_PATTERN = /([^/\\]+\.tool\.(?:ts|js)):(\d+)/;

/**
 * Checks if a stack frame is from a .tool.ts file.
 */
function isToolFrame(frameLine: string): boolean {
  return TOOL_FILE_PATTERN.test(frameLine);
}

/**
 * Extracts `filename:line` from a stack frame string.
 * Returns null if the frame doesn't match the expected pattern.
 */
function extractLocation(frameLine: string): string | null {
  const match = FRAME_LOCATION_PATTERN.exec(frameLine);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

/**
 * Extracts .tool.ts file locations from a stack trace string.
 * Returns an array of `filename:line` strings (e.g. `["flux.tool.ts:14"]`).
 */
export function extractToolFileLocations(stack: string | undefined): string[] {
  if (!stack) {
    return [];
  }

  const lines = stack.split('\n');
  const locations: string[] = [];

  for (const line of lines) {
    if (isToolFrame(line)) {
      const location = extractLocation(line);
      if (location) {
        locations.push(location);
      }
    }
  }

  return locations;
}

/**
 * Formats an error for user-facing output in non-trace mode.
 * Returns a string with .tool.ts file:line locations, or null if
 * no .tool.ts frames exist (meaning the error is purely internal).
 *
 * Output format: `(flux.tool.ts:14)` or `(flux.tool.ts:14, navi.tool.ts:8)`
 */
export function formatErrorForUser(error: Error): string | null {
  const stack = typeof error.stack === 'string' ? error.stack : undefined;
  const locations = extractToolFileLocations(stack);

  if (locations.length === 0) {
    return null;
  }

  return `(${locations.join(', ')})`;
}

/**
 * Type guard to check if a value is an Error object.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
