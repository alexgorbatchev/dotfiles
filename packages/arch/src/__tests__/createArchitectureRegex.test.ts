import { describe, expect, it } from 'bun:test';
import { createArchitectureRegex } from '../createArchitectureRegex';
import type { IArchitecturePatterns } from '../types';

describe('createArchitectureRegex', () => {
  it('should create proper regex patterns from architecture patterns', () => {
    const patterns: IArchitecturePatterns = {
      system: ['darwin', 'macos'],
      cpu: ['arm64', 'aarch64'],
      variants: ['darwin'],
    };

    const regex = createArchitectureRegex(patterns);

    expect(regex.systemPattern).toBe('(darwin|macos)');
    expect(regex.cpuPattern).toBe('(arm64|aarch64)');
    expect(regex.variantPattern).toBe('(darwin)');
  });

  it('should handle empty pattern arrays', () => {
    const patterns: IArchitecturePatterns = {
      system: [],
      cpu: [],
      variants: [],
    };

    const regex = createArchitectureRegex(patterns);

    expect(regex.systemPattern).toBe('');
    expect(regex.cpuPattern).toBe('');
    expect(regex.variantPattern).toBe('');
  });

  it('should escape special regex characters', () => {
    const patterns: IArchitecturePatterns = {
      system: ['x86-64', 'pc-windows-gnu'],
      cpu: ['amd64'],
      variants: ['gnu'],
    };

    const regex = createArchitectureRegex(patterns);

    expect(regex.systemPattern).toBe('(x86-64|pc-windows-gnu)');
    expect(regex.cpuPattern).toBe('(amd64)');
    expect(regex.variantPattern).toBe('(gnu)');
  });

  it('should handle patterns with regex special characters', () => {
    const patterns: IArchitecturePatterns = {
      system: ['test.system', 'test+system'],
      cpu: ['test*cpu'],
      variants: ['test(variant)'],
    };

    const regex = createArchitectureRegex(patterns);

    expect(regex.systemPattern).toBe('(test\\.system|test\\+system)');
    expect(regex.cpuPattern).toBe('(test\\*cpu)');
    expect(regex.variantPattern).toBe('(test\\(variant\\))');
  });
});
