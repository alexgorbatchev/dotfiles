import { describe, expect, test } from 'bun:test';
import {
  assertLegacyLogUsageMatchesAllowlist,
  diffLegacyLogUsage,
  type LegacyLogUsageMap,
} from '../LegacyLogsUsageGuard';

const sampleAllowlist: LegacyLogUsageMap = {
  'src/modules/example/Example.ts': 2,
  'src/modules/another/Module.ts': 1,
};

describe('diffLegacyLogUsage', () => {
  test('returns empty diff when usage matches allowlist', () => {
    const diff = diffLegacyLogUsage(sampleAllowlist, sampleAllowlist);

    expect(diff.added).toEqual({});
    expect(diff.removed).toEqual({});
    expect(diff.changed).toEqual({});
  });

  test('detects added, removed, and changed usage entries', () => {
    const actualUsage: LegacyLogUsageMap = {
      'src/modules/example/Example.ts': 4,
      'src/modules/new/Feature.ts': 3,
    };

    const diff = diffLegacyLogUsage(actualUsage, sampleAllowlist);

    expect(diff.added).toEqual({ 'src/modules/new/Feature.ts': 3 });
    expect(diff.removed).toEqual({ 'src/modules/another/Module.ts': 1 });
    expect(diff.changed).toEqual({ 'src/modules/example/Example.ts': { actual: 4, expected: 2 } });
  });
});

describe('assertLegacyLogUsageMatchesAllowlist', () => {
  test('throws formatted error when diff exists', () => {
    const actualUsage: LegacyLogUsageMap = {
      'src/modules/example/Example.ts': 3,
    };

    expect(() => assertLegacyLogUsageMatchesAllowlist(actualUsage, sampleAllowlist)).toThrow(
      `Legacy logger usage diverged. Update the allowlist if intentional.`
    );
  });
});
