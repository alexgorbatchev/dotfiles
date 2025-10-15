import { describe, expect, test } from 'bun:test';
import { getBinaryNames } from '../getBinaryNames';
import { getBinaryPaths } from '../getBinaryPaths';
import { normalizeBinaries } from '../normalizeBinaries';

describe('normalizeBinaries', () => {
  test('should handle undefined binaries with fallback', () => {
    const result = normalizeBinaries(undefined, 'mytool');
    expect(result).toEqual([{ name: 'mytool', pattern: '*/mytool' }]);
  });

  test('should handle empty array with fallback', () => {
    const result = normalizeBinaries([], 'mytool');
    expect(result).toEqual([{ name: 'mytool', pattern: '*/mytool' }]);
  });

  test('should convert string array to BinaryConfig array', () => {
    const result = normalizeBinaries(['tool1', 'tool2'], 'mytool');
    expect(result).toEqual([
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: '*/tool2' },
    ]);
  });

  test('should pass through BinaryConfig array unchanged', () => {
    const input = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = normalizeBinaries(input, 'mytool');
    expect(result).toEqual(input);
  });

  test('should handle mixed array of strings and BinaryConfig', () => {
    const input = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = normalizeBinaries(input, 'mytool');
    expect(result).toEqual([
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: '*/tool2' },
    ]);
  });
});

describe('getBinaryNames', () => {
  test('should extract names from string array', () => {
    const result = getBinaryNames(['tool1', 'tool2'], 'mytool');
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should extract names from BinaryConfig array', () => {
    const binaries = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = getBinaryNames(binaries, 'mytool');
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should handle mixed array', () => {
    const binaries = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = getBinaryNames(binaries, 'mytool');
    expect(result).toEqual(['tool1', 'tool2']);
  });

  test('should use fallback when binaries is undefined', () => {
    const result = getBinaryNames(undefined, 'mytool');
    expect(result).toEqual(['mytool']);
  });

  test('should use fallback when binaries is empty', () => {
    const result = getBinaryNames([], 'mytool');
    expect(result).toEqual(['mytool']);
  });
});

describe('getBinaryPaths', () => {
  test('should get binary paths from string array', () => {
    const result = getBinaryPaths(['tool1', 'tool2'], 'mytool', '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should get binary paths from BinaryConfig array', () => {
    const binaries = [
      { name: 'tool1', pattern: '*/tool1' },
      { name: 'tool2', pattern: 'bin/tool2' },
    ];
    const result = getBinaryPaths(binaries, 'mytool', '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should handle mixed array', () => {
    const binaries = ['tool1', { name: 'tool2', pattern: '*/tool2' }];
    const result = getBinaryPaths(binaries, 'mytool', '/install/dir');
    expect(result).toEqual(['/install/dir/tool1', '/install/dir/tool2']);
  });

  test('should use fallback when binaries is undefined', () => {
    const result = getBinaryPaths(undefined, 'mytool', '/install/dir');
    expect(result).toEqual(['/install/dir/mytool']);
  });

  test('should use fallback when binaries is empty', () => {
    const result = getBinaryPaths([], 'mytool', '/install/dir');
    expect(result).toEqual(['/install/dir/mytool']);
  });
});
