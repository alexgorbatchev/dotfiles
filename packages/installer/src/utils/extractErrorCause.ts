/**
 * Extracts a user-friendly error cause from an error object.
 * For ShellError, extracts the trimmed stderr content.
 * For other errors, returns the error message.
 */

interface IShellErrorLike {
  name: string;
  message?: string;
  exitCode?: number;
  stdout?: unknown;
  stderr?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShellErrorLike(value: unknown): value is IShellErrorLike {
  if (!isRecord(value)) {
    return false;
  }

  const nameValue = value["name"];
  if (typeof nameValue !== "string") {
    return false;
  }

  return nameValue === "ShellError";
}

function normalizeShellStream(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value instanceof Uint8Array) {
    const result = Buffer.from(value).toString("utf8").trim();
    return result;
  }

  return "";
}

/**
 * Extracts a concise error cause from an error for display in log messages.
 * For ShellError, extracts stderr content if available, otherwise uses the message.
 * For other errors, returns the error message.
 *
 * @param error - The error to extract the cause from
 * @returns A trimmed string containing the error cause
 */
export function extractErrorCause(error: unknown): string {
  if (isShellErrorLike(error)) {
    const stderr = normalizeShellStream(error.stderr);
    if (stderr.length > 0) {
      return stderr;
    }

    const stdout = normalizeShellStream(error.stdout);
    if (stdout.length > 0) {
      return stdout;
    }

    if (error.message) {
      return error.message;
    }

    return `exit code ${error.exitCode ?? "unknown"}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
