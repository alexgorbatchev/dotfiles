import { ARCH_VALUES, LIBC_VALUES, OS_VALUES } from "@dotfiles/config";
import { LOG_LEVEL_NAMES } from "@dotfiles/logger";
import { Command } from "commander";
import type { ICommandCompletionMeta, IGlobalProgram } from "./types";

/**
 * Completion metadata for global CLI options.
 * These apply to all commands.
 */
export const GLOBAL_OPTIONS_COMPLETION: ICommandCompletionMeta = {
  name: "dotfiles",
  description: "Dotfiles management CLI",
  options: [
    { flag: "--config", description: "Path to configuration file", hasArg: true, argPlaceholder: "<path>" },
    { flag: "--dry-run", description: "Simulate operations without changes" },
    { flag: "--log", description: "Set log level", hasArg: true, argPlaceholder: "<level>" },
    { flag: "--verbose", description: "Enable detailed debug messages" },
    { flag: "--quiet", description: "Suppress informational output" },
    { flag: "--platform", description: "Override detected platform", hasArg: true, argPlaceholder: "<platform>" },
    { flag: "--arch", description: "Override detected architecture", hasArg: true, argPlaceholder: "<arch>" },
    { flag: "--libc", description: "Override detected Linux libc", hasArg: true, argPlaceholder: "<libc>" },
  ],
};

/**
 * Creates and configures the main Commander.js program with global options.
 *
 * Sets up the CLI program with global options available to all commands:
 * - Configuration file path
 * - Dry-run mode
 * - Log level control
 * - Platform/architecture overrides
 *
 * @returns The configured Commander.js program instance
 * @example
 * ```typescript
 * const program = createProgram();
 * program
 *   .command('install')
 *   .action(async (options) => {
 *     const globalOpts = program.opts();
 *     console.log(globalOpts.verbose); // Access global options
 *   });
 * ```
 */
export function createProgram(): IGlobalProgram {
  const version = typeof DOTFILES_VERSION === "string" ? DOTFILES_VERSION : (process.env.DOTFILES_VERSION ?? "0.0.0");

  const program: IGlobalProgram = new Command()
    .name("generator")
    .description("CLI tool for managing dotfiles and tool configurations")
    .version(version)
    .option("--config <path>", "Path to a configuration file", "")
    .option("--dry-run", "Simulate all operations without making changes to the file system", false)
    .option("--trace", "Show file paths and line numbers in log output", false)
    .option(`--log <level>`, `Set log level (${LOG_LEVEL_NAMES.join(", ")})`, "default")
    .option("--verbose", "Enable detailed debug messages (alias for --log=verbose)", false)
    .option(
      "--quiet",
      "Suppress all informational and debug output. Errors are still displayed (alias for --log=quiet)",
      false,
    )
    .option("--platform <platform>", `Override the detected platform (${OS_VALUES.join(", ")})`)
    .option("--arch <arch>", `Override the detected architecture (${ARCH_VALUES.join(", ")})`)
    .option("--libc <libc>", `Override the detected Linux libc (${LIBC_VALUES.join(", ")})`);

  return program;
}
