declare const CLI_BIN_PATH: string | undefined;

/**
 * Gets the path to the CLI script or executable.
 *
 * `CLI_BIN_PATH` is set by the `scripts/compile.sh` at build time.
 */
export function getCliScriptPath(): string {
  if (typeof CLI_BIN_PATH === "undefined") {
    return process.argv[1] ?? process.argv[0] ?? "bun";
  }

  return CLI_BIN_PATH;
}
