/**
 * @file src/modules/logger/createLogger.ts
 * @description Utility for creating namespaced debug loggers.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `.clinerules` (for file structure, naming, logging requirements)
 * - `memory-bank/techContext.md` (for `debug` module usage)
 *
 * ### Tasks:
 * - [x] Define `createLogger` function.
 * - [x] Import `debug`.
 * - [x] Implement namespacing with "[project-name]:" prefix (using "dot" as project-name for now as per examples).
 * - [ ] Write tests for `createLogger`.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import debug from 'debug';

// The project name for logging, can be configured or derived if needed.
// Using "dot" as a placeholder based on examples like "dot:installTool".
// This should ideally come from a central configuration or project name constant.
const PROJECT_NAMESPACE = 'dot';

/**
 * Creates a namespaced debug logger.
 * Each file should have `const log = createLogger(exported class or function name)`.
 * The `log` function must be called at the top of every function with key argument values
 * like `log(fileName=%s, index=%s)` and large objects should not be logged to avoid log spam.
 * Class methods must have `log(methodName: arg=%s)` at the top of every method.
 *
 * @param name The specific namespace for the logger (e.g., component or module name).
 * @returns A debug logger instance.
 */
export function createLogger(name: string): debug.Debugger {
  return debug(`${PROJECT_NAMESPACE}:${name}`);
}
