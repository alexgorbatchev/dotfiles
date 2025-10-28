import { describe, expect, test } from 'bun:test';
import { normalizeVersion } from '../normalizeVersion';

describe('normalizeVersion', () => {
  test('removes v prefix from version', () => {
    const result: string = normalizeVersion('v1.2.3');
    expect(result).toBe('1.2.3');
  });

  test('removes V prefix from version', () => {
    const result: string = normalizeVersion('V1.2.3');
    expect(result).toBe('1.2.3');
  });

  test('handles already normalized version', () => {
    const result: string = normalizeVersion('1.2.3');
    expect(result).toBe('1.2.3');
  });

  test('handles version with prerelease', () => {
    const result: string = normalizeVersion('v1.2.3-alpha.1');
    expect(result).toBe('1.2.3-alpha.1');
  });

  test('handles version with build metadata', () => {
    const result: string = normalizeVersion('v1.2.3+build.123');
    expect(result).toBe('1.2.3+build.123');
  });

  test('handles version with both prerelease and build metadata', () => {
    const result: string = normalizeVersion('v1.2.3-beta.2+build.456');
    expect(result).toBe('1.2.3-beta.2+build.456');
  });

  test('returns original version if semver.clean fails and no known prefix', () => {
    const result: string = normalizeVersion('invalid.version.string');
    expect(result).toBe('invalid.version.string');
  });

  test('preserves version with only major.minor', () => {
    const result: string = normalizeVersion('v1.0');
    // semver.clean() requires patch version, returns original
    expect(result).toBe('v1.0');
  });

  test('preserves version with four parts', () => {
    const result: string = normalizeVersion('v1.2.3.4');
    // semver doesn't support 4-part versions, returns original
    expect(result).toBe('v1.2.3.4');
  });
});
