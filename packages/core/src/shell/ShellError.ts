/**
 * Error thrown when a shell command exits with non-zero code.
 */
export class ShellError extends Error {
  override name = 'ShellError';

  constructor(
    public readonly code: number,
    public readonly stdout: string,
    public readonly stderr: string,
    _command: string,
  ) {
    super(`Exited with code: ${code}`);
    // Preserve command in message for debugging
    if (stderr) {
      this.message += `\n${stderr}`;
    }
  }
}
