import type { SystemInfo } from '@dotfiles/schemas';
import { createArchitectureRegex } from './createArchitectureRegex';
import { getArchitecturePatterns } from './getArchitecturePatterns';
import type { ArchitectureRegex } from './types';

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
 *
 * @public
 */
export function getArchitectureRegex(systemInfo: SystemInfo): ArchitectureRegex {
  const patterns = getArchitecturePatterns(systemInfo);
  const regex = createArchitectureRegex(patterns);
  return regex;
}
