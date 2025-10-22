import type { ArchitectureRegex } from './ArchitectureRegex';

/**
 * Utility function to check if an asset name matches the architecture.
 * This can be used to filter GitHub release assets.
 *
 * @param assetName - Name of the GitHub release asset
 * @param architectureRegex - Regex patterns from getArchitectureRegex
 * @returns True if the asset matches the current architecture
 */
export function matchesArchitecture(assetName: string, architectureRegex: ArchitectureRegex): boolean {
  const lowerAssetName = assetName.toLowerCase();

  // Check if asset matches system pattern
  const systemMatch = architectureRegex.systemPattern
    ? new RegExp(architectureRegex.systemPattern, 'i').test(lowerAssetName)
    : true;

  // Check if asset matches CPU pattern
  const cpuMatch = architectureRegex.cpuPattern
    ? new RegExp(architectureRegex.cpuPattern, 'i').test(lowerAssetName)
    : true;

  const matches = systemMatch && cpuMatch;

  return matches;
}
