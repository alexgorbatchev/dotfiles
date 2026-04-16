declare const CLI_BIN_PATH: string | undefined;

import { getCliBinPath } from "./getCliBinPath";

/**
 * Gets the command string used to invoke the current CLI entrypoint.
 *
 * When running from source or an installed script, we intentionally resolve Bun
 * from PATH at execution time instead of pinning the current Bun interpreter path.
 */
export function getCliInvocationCommand(): string {
  if (typeof CLI_BIN_PATH !== "undefined") {
    return CLI_BIN_PATH;
  }

  return `bun ${getCliBinPath()}`;
}
