import type { ISystemInfo } from "@dotfiles/core";
import { createArchitectureRegex } from "./createArchitectureRegex";
import { getArchitecturePatterns } from "./getArchitecturePatterns";
import type { IArchitectureRegex } from "./types";

/**
 * The main function that combines pattern generation and regex creation.
 *
 * This is the primary entry point for generating the architecture-specific
 * regular expressions used to match release assets. It takes system information,
 * generates the corresponding string patterns, and then compiles them into
 * a set of regex patterns.
 *
 * @param systemInfo - An object containing system information, such as OS and CPU architecture.
 * @returns An object containing combined regex patterns for asset matching.
 */
export function getArchitectureRegex(systemInfo: ISystemInfo): IArchitectureRegex {
  const patterns = getArchitecturePatterns(systemInfo);
  const regex = createArchitectureRegex(patterns);
  return regex;
}
