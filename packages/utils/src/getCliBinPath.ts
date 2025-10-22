declare const CLI_BIN_PATH: string | undefined;

/**
 * Gets the path to the CLI binary.
 *
 * `CLI_BIN_PATH` is set by the `scripts/compile.sh` at build time.
 */
export function getCliBinPath(): string {
  if (typeof CLI_BIN_PATH === 'undefined') {
    return process.argv.slice(0, 2).join(' ');
  }

  return CLI_BIN_PATH;
}
