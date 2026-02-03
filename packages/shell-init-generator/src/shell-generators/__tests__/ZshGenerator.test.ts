import type { ToolConfig } from '@dotfiles/core';
import { always } from '@dotfiles/core';
import {
  isAliasEmission,
  isCompletionEmission,
  isEnvironmentEmission,
  isFunctionEmission,
  isScriptEmission,
} from '@dotfiles/shell-emissions';
import { beforeEach, describe, expect, it } from 'bun:test';
import { ZshGenerator } from '../ZshGenerator';
import { createMockProjectConfigWithPathsOnly } from './createMockProjectConfigWithPathsOnly';

describe('ZshGenerator', () => {
  let generator: ZshGenerator;

  beforeEach(() => {
    generator = new ZshGenerator(createMockProjectConfigWithPathsOnly());
  });

  it('should have correct shell type and file extension', () => {
    expect(generator.shellType).toBe('zsh');
    expect(generator.fileExtension).toBe('.zsh');
  });

  it('should return correct default output path', () => {
    const outputPath = generator.getDefaultOutputPath();
    expect(outputPath).toBe('/home/test/.dotfiles/.generated/shell-scripts/main.zsh');
  });

  describe('extractEmissions', () => {
    it('should extract environment variables as emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            environment: {
              TEST_VAR: 'value1',
              DEBUG: 'true',
            },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const envEmissions = emissions.filter(isEnvironmentEmission);

      expect(envEmissions).toHaveLength(1);
      expect(envEmissions[0]?.variables).toEqual({
        TEST_VAR: 'value1',
        DEBUG: 'true',
      });
    });

    it('should extract aliases as emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            aliases: {
              tt: 'test-tool',
              ttd: 'test-tool --debug',
            },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const aliasEmissions = emissions.filter(isAliasEmission);

      expect(aliasEmissions).toHaveLength(1);
      expect(aliasEmissions[0]?.aliases).toEqual({
        tt: 'test-tool',
        ttd: 'test-tool --debug',
      });
    });

    it('should extract functions as emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            functions: {
              myFunc: 'echo "hello"',
              setup: 'cd /path && ./setup.sh',
            },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const funcEmissions = emissions.filter(isFunctionEmission);

      expect(funcEmissions).toHaveLength(2);
      expect(funcEmissions.map((e) => e.name).toSorted()).toEqual(['myFunc', 'setup']);
    });

    it('should extract scripts as emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            scripts: [
              always('echo "always script"'),
            ],
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const scriptEmissions = emissions.filter(isScriptEmission);

      expect(scriptEmissions).toHaveLength(1);
      expect(scriptEmissions[0]?.timing).toBe('always');
      expect(scriptEmissions[0]?.content).toBe('echo "always script"');
    });

    it('should extract completions as emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            completions: { source: '_test-tool' },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const completionEmissions = emissions.filter(isCompletionEmission);

      expect(completionEmissions).toHaveLength(1);
      expect(completionEmissions[0]?.directories).toContain(
        '/home/test/.dotfiles/.generated/shell-scripts/zsh/completions',
      );
    });

    it('should return empty array for tool with no zsh config', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);

      expect(emissions).toHaveLength(0);
    });
  });

  describe('hasEmissions', () => {
    it('should return true for tool with shell config', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            aliases: { t: 'test' },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      expect(generator.hasEmissions(toolConfig)).toBe(true);
    });

    it('should return false for tool without shell config', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        installationMethod: 'manual',
        installParams: {},
      };

      expect(generator.hasEmissions(toolConfig)).toBe(false);
    });
  });

  describe('generateFileContent', () => {
    it('should generate valid file content from emissions', () => {
      const toolConfig: ToolConfig = {
        name: 'test-tool',
        binaries: ['test-tool'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            environment: { TEST_VAR: 'value' },
            aliases: { t: 'test' },
          },
        },
        installationMethod: 'manual',
        installParams: {},
      };

      const emissions = generator.extractEmissions(toolConfig);
      const toolEmissions = new Map([['test-tool', emissions]]);
      const content = generator.generateFileContent(toolEmissions);

      expect(content).toContain('# THIS FILE IS AUTOMATICALLY GENERATED');
      expect(content).toContain('export TEST_VAR="value"');
      expect(content).toContain('alias t="test"');
    });
  });
});
