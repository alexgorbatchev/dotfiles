import { describe, expect, it } from 'bun:test';
import { normalizeUserVersion } from '../normalizeUserVersion';

describe('normalizeUserVersion', () => {
  describe('versions without prefix', () => {
    it('should return version unchanged for "2.24.0"', () => {
      const result = normalizeUserVersion('2.24.0');
      expect(result).toBe('2.24.0');
    });

    it('should return version unchanged for "1.0.0"', () => {
      const result = normalizeUserVersion('1.0.0');
      expect(result).toBe('1.0.0');
    });

    it('should return version unchanged for two-part "15.1"', () => {
      const result = normalizeUserVersion('15.1');
      expect(result).toBe('15.1');
    });
  });

  describe('versions with v prefix', () => {
    it('should strip v prefix from "v2.24.0"', () => {
      const result = normalizeUserVersion('v2.24.0');
      expect(result).toBe('2.24.0');
    });

    it('should strip v prefix from "v1.0.0"', () => {
      const result = normalizeUserVersion('v1.0.0');
      expect(result).toBe('1.0.0');
    });

    it('should strip v prefix from two-part "v2.24"', () => {
      const result = normalizeUserVersion('v2.24');
      expect(result).toBe('2.24');
    });
  });

  describe('prerelease versions', () => {
    it('should preserve prerelease in "1.0.0-beta.1"', () => {
      const result = normalizeUserVersion('1.0.0-beta.1');
      expect(result).toBe('1.0.0-beta.1');
    });

    it('should strip prefix and preserve prerelease in "v2.0.0-rc1"', () => {
      const result = normalizeUserVersion('v2.0.0-rc1');
      expect(result).toBe('2.0.0-rc1');
    });

    it('should handle alpha releases "v1.0.0-alpha"', () => {
      const result = normalizeUserVersion('v1.0.0-alpha');
      expect(result).toBe('1.0.0-alpha');
    });
  });

  describe('edge cases', () => {
    it('should return original for non-version string "latest"', () => {
      const result = normalizeUserVersion('latest');
      expect(result).toBe('latest');
    });

    it('should return original for empty string', () => {
      const result = normalizeUserVersion('');
      expect(result).toBe('');
    });

    it('should return original for single number "v1"', () => {
      // "v1" doesn't match semver pattern (needs at least major.minor)
      const result = normalizeUserVersion('v1');
      expect(result).toBe('v1');
    });

    it('should strip complex prefixes from versions', () => {
      // User accidentally passes a full tag like "jq-1.8.1"
      const result = normalizeUserVersion('jq-1.8.1');
      expect(result).toBe('1.8.1');
    });
  });
});
