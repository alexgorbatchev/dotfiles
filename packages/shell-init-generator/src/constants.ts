/**
 * Valid shell function name pattern.
 * Must start with a letter or underscore, followed by letters, numbers, underscores, or hyphens.
 * This pattern is compatible with bash, zsh, and PowerShell naming conventions.
 */
export const VALID_FUNCTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
