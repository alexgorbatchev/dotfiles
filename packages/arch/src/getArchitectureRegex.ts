import type { SystemInfo } from '@dotfiles/schemas';
import { createArchitectureRegex } from './createArchitectureRegex';
import { getArchitecturePatterns } from './getArchitecturePatterns';
import type { ArchitectureRegex } from './types';

/**
 * Main function that combines pattern generation and regex creation.
 * This is the primary entry point for architecture detection.
 *
 * @param systemInfo - System information from os module
 * @returns Combined regex patterns for GitHub release asset matching
 */
export function getArchitectureRegex(systemInfo: SystemInfo): ArchitectureRegex {
  const patterns = getArchitecturePatterns(systemInfo);
  const regex = createArchitectureRegex(patterns);
  return regex;
}
