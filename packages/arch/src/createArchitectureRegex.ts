import type { ArchitecturePatterns } from '@dotfiles/schemas';
import type { ArchitectureRegex } from './ArchitectureRegex';

/**
 * Creates combined regex patterns from architecture patterns.
 * These patterns can be used to match GitHub release asset names.
 *
 * @param patterns - Architecture patterns from getArchitecturePatterns
 * @returns Combined regex patterns for asset matching
 */
export function createArchitectureRegex(patterns: ArchitecturePatterns): ArchitectureRegex {
  // Escape special regex characters in pattern strings
  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Create alternations for each pattern group
  const systemPattern = patterns.system.length > 0 ? `(${patterns.system.map(escapeRegex).join('|')})` : '';

  const cpuPattern = patterns.cpu.length > 0 ? `(${patterns.cpu.map(escapeRegex).join('|')})` : '';

  const variantPattern = patterns.variants.length > 0 ? `(${patterns.variants.map(escapeRegex).join('|')})` : '';

  const result: ArchitectureRegex = {
    systemPattern,
    cpuPattern,
    variantPattern,
  };

  return result;
}
