export type LegacyLogUsageMap = Record<string, number>;

export type LegacyLogUsageDiff = {
  added: LegacyLogUsageMap;
  removed: LegacyLogUsageMap;
  changed: Record<string, { actual: number; expected: number }>;
};

const hasEntries = (usage: Record<string, unknown>): boolean => Object.keys(usage).length > 0;

export function diffLegacyLogUsage(
  actualUsage: LegacyLogUsageMap,
  allowlistedUsage: LegacyLogUsageMap
): LegacyLogUsageDiff {
  const added: LegacyLogUsageMap = {};
  const removed: LegacyLogUsageMap = {};
  const changed: Record<string, { actual: number; expected: number }> = {};

  for (const [filePath, actualOccurrences] of Object.entries(actualUsage)) {
    const expectedOccurrences = allowlistedUsage[filePath];

    if (expectedOccurrences === undefined) {
      added[filePath] = actualOccurrences;
      continue;
    }

    if (expectedOccurrences !== actualOccurrences) {
      changed[filePath] = { actual: actualOccurrences, expected: expectedOccurrences };
    }
  }

  for (const [filePath, expectedOccurrences] of Object.entries(allowlistedUsage)) {
    if (actualUsage[filePath] === undefined) {
      removed[filePath] = expectedOccurrences;
    }
  }

  return {
    added,
    removed,
    changed,
  };
}

const formatDiffSection = (title: string, entries: Record<string, unknown>): string | null => {
  if (!hasEntries(entries)) {
    return null;
  }

  const rows = Object.entries(entries)
    .map(([filePath, value]) => `  - ${filePath}: ${JSON.stringify(value)}`)
    .join('\n');

  return `${title}:\n${rows}`;
};

const formatDiffMessage = (diff: LegacyLogUsageDiff): string => {
  const sections = [
    formatDiffSection('Added legacy logger usage', diff.added),
    formatDiffSection('Removed allowlisted legacy logger usage', diff.removed),
    formatDiffSection('Changed legacy logger usage counts', diff.changed),
  ].filter((section): section is string => section !== null);

  return ['Legacy logger usage diverged. Update the allowlist if intentional.', ...sections].join('\n\n');
};

export function assertLegacyLogUsageMatchesAllowlist(
  actualUsage: LegacyLogUsageMap,
  allowlistedUsage: LegacyLogUsageMap
): void {
  const diff = diffLegacyLogUsage(actualUsage, allowlistedUsage);

  if (!hasEntries(diff.added) && !hasEntries(diff.removed) && !hasEntries(diff.changed)) {
    return;
  }

  throw new Error(formatDiffMessage(diff));
}
