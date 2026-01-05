import { describe, expect, it } from 'bun:test';
import { buildCorrectedTag } from '../buildCorrectedTag';

describe('buildCorrectedTag', () => {
  describe('v-prefix repositories', () => {
    it('should add v prefix when user omits it', () => {
      const result = buildCorrectedTag('v2.24.0', '2.23.0');
      expect(result).toBe('v2.23.0');
    });

    it('should normalize when user includes v prefix', () => {
      const result = buildCorrectedTag('v2.24.0', 'v2.23.0');
      expect(result).toBe('v2.23.0');
    });

    it('should handle prerelease versions', () => {
      const result = buildCorrectedTag('v2.0.0', '2.0.0-beta.1');
      expect(result).toBe('v2.0.0-beta.1');
    });
  });

  describe('tool-name prefix repositories', () => {
    it('should add jq- prefix when user provides plain version', () => {
      const result = buildCorrectedTag('jq-1.8.1', '1.7.0');
      expect(result).toBe('jq-1.7.0');
    });

    it('should strip v and add correct prefix', () => {
      const result = buildCorrectedTag('jq-1.8.1', 'v1.7.0');
      expect(result).toBe('jq-1.7.0');
    });

    it('should handle fd prefix', () => {
      const result = buildCorrectedTag('fd-9.0.0', '8.7.0');
      expect(result).toBe('fd-8.7.0');
    });

    it('should handle complex prefix like tool-v', () => {
      const result = buildCorrectedTag('tool-v1.2.3', '1.0.0');
      expect(result).toBe('tool-v1.0.0');
    });
  });

  describe('no-prefix repositories', () => {
    it('should not add prefix when repo uses none', () => {
      const result = buildCorrectedTag('15.1.0', '15.0.0');
      expect(result).toBe('15.0.0');
    });

    it('should strip v prefix when repo uses none', () => {
      const result = buildCorrectedTag('15.1.0', 'v15.0.0');
      expect(result).toBe('15.0.0');
    });

    it('should handle two-part versions', () => {
      const result = buildCorrectedTag('15.1', '14.2');
      expect(result).toBe('14.2');
    });
  });

  describe('edge cases', () => {
    it('should return user version when latest tag has no version pattern', () => {
      // When latest tag is like "latest", no prefix can be detected
      const result = buildCorrectedTag('latest', '1.0.0');
      expect(result).toBe('1.0.0');
    });

    it('should handle empty user version', () => {
      const result = buildCorrectedTag('v1.0.0', '');
      expect(result).toBe('v');
    });

    it('should handle non-version user input', () => {
      const result = buildCorrectedTag('v2.0.0', 'latest');
      expect(result).toBe('vlatest');
    });
  });
});
