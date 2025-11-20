import { beforeEach, describe, expect, test } from 'bun:test';
import type { ToolConfig } from '@dotfiles/core';
import { extractBinaryNames, generateToolTypesContent, generateUnionType } from '../generateToolTypes';

function createMockToolConfig(name: string, binaries?: (string | { name: string })[]): ToolConfig {
  const config: ToolConfig = {
    name,
    binaries,
    installationMethod: 'manual',
    installParams: {},
  } as ToolConfig;
  return config;
}

describe('generateToolTypes', () => {
  beforeEach(() => {
    delete process.env.DOTFILES_BUILT_PACKAGE_NAME;
  });

  describe('extractBinaryNames', () => {
    test('should extract binary names from tool configs', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        ripgrep: createMockToolConfig('ripgrep', ['rg']),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(1);
      expect(binaryNames.has('rg')).toBe(true);
    });

    test('should extract multiple binary names from multiple tool configs', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        ripgrep: createMockToolConfig('ripgrep', ['rg']),
        bat: createMockToolConfig('bat', ['bat']),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(2);
      expect(binaryNames.has('rg')).toBe(true);
      expect(binaryNames.has('bat')).toBe(true);
    });

    test('should handle tool configs with multiple binaries', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        node: createMockToolConfig('node', ['node', 'npm', 'npx']),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(3);
      expect(binaryNames.has('node')).toBe(true);
      expect(binaryNames.has('npm')).toBe(true);
      expect(binaryNames.has('npx')).toBe(true);
    });

    test('should use tool name as binary name when no binaries are specified', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        ripgrep: createMockToolConfig('ripgrep'),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(1);
      expect(binaryNames.has('ripgrep')).toBe(true);
    });

    test('should return empty set for empty tool configs', () => {
      const toolConfigs: Record<string, ToolConfig> = {};

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(0);
    });

    test('should handle IBinaryConfig objects', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        tool: createMockToolConfig('tool', [{ name: 'binary-name' }]),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(1);
      expect(binaryNames.has('binary-name')).toBe(true);
    });

    test('should handle mix of string and IBinaryConfig', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        tool: createMockToolConfig('tool', ['string-binary', { name: 'config-binary' }]),
      };

      const binaryNames: Set<string> = extractBinaryNames(toolConfigs);

      expect(binaryNames.size).toBe(2);
      expect(binaryNames.has('string-binary')).toBe(true);
      expect(binaryNames.has('config-binary')).toBe(true);
    });
  });

  describe('generateUnionType', () => {
    test('should generate union type from binary names', () => {
      const binaryNames: Set<string> = new Set(['rg', 'bat', 'fd']);

      const unionType: string = generateUnionType(binaryNames);

      expect(unionType).toBe("'bat' | 'fd' | 'rg'");
    });

    test('should return string for empty set', () => {
      const binaryNames: Set<string> = new Set();

      const unionType: string = generateUnionType(binaryNames);

      expect(unionType).toBe('string');
    });

    test('should sort binary names alphabetically', () => {
      const binaryNames: Set<string> = new Set(['zebra', 'apple', 'mango']);

      const unionType: string = generateUnionType(binaryNames);

      expect(unionType).toBe("'apple' | 'mango' | 'zebra'");
    });
  });

  describe('generateToolTypesContent', () => {
    test('should generate complete tool-types.d.ts content', () => {
      const toolConfigs: Record<string, ToolConfig> = {
        ripgrep: createMockToolConfig('ripgrep', ['rg']),
      };

      const content: string = generateToolTypesContent(toolConfigs);

      expect(content).toContain("declare module '@gitea/dotfiles'");
      expect(content).toContain('interface IKnownBinNameRegistry');
      expect(content).toContain("    'rg': never;");
      expect(content).toContain('export {};');
    });

    test('should generate fallback string type for empty tool configs', () => {
      const toolConfigs: Record<string, ToolConfig> = {};

      const content: string = generateToolTypesContent(toolConfigs);

      expect(content).toContain("declare module '@gitea/dotfiles'");
      expect(content).toContain('interface IKnownBinNameRegistry {}');
      expect(content).toContain('export {};');
    });

    test('respects configured package name from environment variable', () => {
      process.env.DOTFILES_BUILT_PACKAGE_NAME = '@dotfiles/core';
      const toolConfigs: Record<string, ToolConfig> = {
        ripgrep: createMockToolConfig('ripgrep', ['rg']),
      };

      const content: string = generateToolTypesContent(toolConfigs);

      expect(content).toContain("declare module '@dotfiles/core'");
      expect(content).not.toContain("declare module '@dotfiles/core/builder'");
    });
  });
});
