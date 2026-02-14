import { describe, expect, it } from 'bun:test';
import {
  formatAssetPatternForLog,
  isValidAssetPatternString,
  matchAssetPattern,
} from '../matchAssetPattern';

describe('matchAssetPattern', () => {
  describe('glob patterns', () => {
    it('should match glob patterns against filenames', () => {
      expect(matchAssetPattern('tool-linux-amd64.tar.gz', '*.tar.gz')).toBe(true);
      expect(matchAssetPattern('tool-linux-amd64.zip', '*.tar.gz')).toBe(false);
    });

    it('should match complex glob patterns', () => {
      expect(matchAssetPattern('tool-v1.2.3-linux-amd64.tar.gz', 'tool-*-linux-*.tar.gz')).toBe(true);
      expect(matchAssetPattern('other-v1.2.3-linux-amd64.tar.gz', 'tool-*-linux-*.tar.gz')).toBe(false);
    });
  });

  describe('regex string patterns', () => {
    it('should match regex string patterns', () => {
      expect(matchAssetPattern('tool-linux-amd64.tar.gz', '/^tool-.*\\.tar\\.gz$/')).toBe(true);
      expect(matchAssetPattern('tool-linux-amd64.zip', '/^tool-.*\\.tar\\.gz$/')).toBe(false);
    });

    it('should support regex flags', () => {
      expect(matchAssetPattern('TOOL-LINUX.TAR.GZ', '/tool-linux\\.tar\\.gz/i')).toBe(true);
      expect(matchAssetPattern('TOOL-LINUX.TAR.GZ', '/tool-linux\\.tar\\.gz/')).toBe(false);
    });
  });

  describe('RegExp object patterns', () => {
    it('should match RegExp objects', () => {
      const pattern = /^tool-.*\.zip$/;
      expect(matchAssetPattern('tool-linux-amd64.zip', pattern)).toBe(true);
      expect(matchAssetPattern('tool-linux-amd64.tar.gz', pattern)).toBe(false);
    });
  });
});

describe('isValidAssetPatternString', () => {
  it('should accept simple glob patterns', () => {
    expect(isValidAssetPatternString('*.tar.gz')).toBe(true);
    expect(isValidAssetPatternString('tool-*-linux-*.tar.gz')).toBe(true);
  });

  it('should accept valid regex strings', () => {
    expect(isValidAssetPatternString('/^tool-.*\\.tar\\.gz$/')).toBe(true);
    expect(isValidAssetPatternString('/pattern/i')).toBe(true);
  });

  it('should reject invalid regex strings', () => {
    expect(isValidAssetPatternString('/[invalid/')).toBe(false);
  });

  it('should accept strings that start with / but are not regex', () => {
    expect(isValidAssetPatternString('/')).toBe(true);
  });
});

describe('formatAssetPatternForLog', () => {
  it('should return string patterns as-is', () => {
    expect(formatAssetPatternForLog('*.tar.gz')).toBe('*.tar.gz');
  });

  it('should format RegExp patterns using toString', () => {
    expect(formatAssetPatternForLog(/^tool-.*\.zip$/)).toBe('/^tool-.*\\.zip$/');
  });
});
