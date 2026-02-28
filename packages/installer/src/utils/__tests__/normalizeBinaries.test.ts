import { describe, expect, test } from 'bun:test';
import { getBinaryNames } from '../getBinaryNames';
import { getBinaryPaths } from '../getBinaryPaths';
import { normalizeBinaries } from '../normalizeBinaries';

describe('normalizeBinaries', () => {
  test('should return empty array for undefined binaries', () => {
    const result = normalizeBinaries(undefined);
    expect(result).toEqual([]);
  });

  test('should return empty array for empty binaries array', () => {
    const result = normalizeBinaries([]);
    expect(result).toEqual([]);
  });

  test('should convert string array to IBinaryConfig array', () => {
    const result = normalizeBinaries(['tool1', 'tool2']);
    expect(result).toEqual([
      { name: 'tool1', pattern: '{,*/}tool1' },
      { name: 'tool2', pattern: '{,*/}tool2' },
    ]);
  });

  test('should pass through IBinaryConfig array unchanged', () => {
    const input = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = normalizeBinaries(input);
    expect(result).toEqual(input);
  });

  test('should handle mixed array of strings and IBinaryConfig', () => {
    const input = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = normalizeBinaries(input);
    expect(result).toEqual([
      { name: 'tool1', pattern: '{,*/}tool1' },
      { name: 'tool2', pattern: '*/tool2' },
    ]);
  });
});

describe('getBinaryNames', () => {
  test('should extract names from string array', () => {
    const result = getBinaryNames(['tool1', 'tool2']);
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should extract names from IBinaryConfig array', () => {
    const binaries = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = getBinaryNames(binaries);
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should handle mixed array', () => {
    const binaries = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = getBinaryNames(binaries);
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should return empty array when binaries is undefined', () => {
    const result = getBinaryNames(undefined);
    expect(result).toEqual([]);
  });

  test('should return empty array when binaries is empty', () => {
    const result = getBinaryNames([]);
    expect(result).toEqual([]);
  });
});

describe('getBinaryPaths', () => {
  test('should get binary paths from string array', () => {
    const result = getBinaryPaths(['tool1', 'tool2'], '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should get binary paths from IBinaryConfig array', () => {
    const binaries = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = getBinaryPaths(binaries, '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should handle mixed array', () => {
    const binaries = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = getBinaryPaths(binaries, '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should return empty array when binaries is undefined', () => {
    const result = getBinaryPaths(undefined, '/install/dir');
    expect(result).toEqual([]);
  });

  test('should return empty array when binaries is empty', () => {
    const result = getBinaryPaths([], '/install/dir');
    expect(result).toEqual([]);
  });
});
