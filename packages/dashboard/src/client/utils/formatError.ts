export interface IFormattedError {
  message: string;
  command?: string;
}

/** Surfaces the `brew trust` command buried in Homebrew's untrusted-tap error so the UI can offer it directly. */
export function formatError(error: string): IFormattedError {
  const trustMatch = error.match(/Run `(brew trust[^`]+)`/);

  if (trustMatch) {
    return {
      message: "This Homebrew tap requires trust before installation.",
      command: trustMatch[1],
    };
  }

  return { message: error };
}
