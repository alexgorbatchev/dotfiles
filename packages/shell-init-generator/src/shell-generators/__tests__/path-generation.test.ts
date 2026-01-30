import type { ProjectConfig } from '@dotfiles/config';
import { beforeEach, describe, expect, it } from 'bun:test';
import { BashGenerator } from '../BashGenerator';
import { ZshGenerator } from '../ZshGenerator';
import { createMockProjectConfigWithPathsOnly } from './createMockProjectConfigWithPathsOnly';

describe('PATH generation', () => {
  let mockProjectConfig: ProjectConfig;

  beforeEach(() => {
    mockProjectConfig = createMockProjectConfigWithPathsOnly();
  });

  describe('should use paths.targetDir for PATH export', () => {
    it('for zsh', () => {
      const generator = new ZshGenerator(mockProjectConfig);
      const toolContents = new Map();

      const content = generator.generateFileContent(toolContents);

      expect(content).toContain(`export PATH="${mockProjectConfig.paths.targetDir}:$PATH"`);
      expect(content).not.toContain(`export PATH="${mockProjectConfig.paths.binariesDir}:$PATH"`);
    });

    it('for bash', () => {
      const generator = new BashGenerator(mockProjectConfig);
      const toolContents = new Map();

      const content = generator.generateFileContent(toolContents);

      expect(content).toContain(`export PATH="${mockProjectConfig.paths.targetDir}:$PATH"`);
      expect(content).not.toContain(`export PATH="${mockProjectConfig.paths.binariesDir}:$PATH"`);
    });
  });

  describe('should check if PATH already contains targetDir', () => {
    it('should wrap PATH export in conditional check for zsh', () => {
      const generator = new ZshGenerator(mockProjectConfig);
      const toolContents = new Map();

      const content = generator.generateFileContent(toolContents);

      const targetDir = mockProjectConfig.paths.targetDir;
      expect(content).toContain(`if [[ ":$PATH:" != *":${targetDir}:"* ]]; then`);
      expect(content).toContain(`export PATH="${targetDir}:$PATH"`);
      expect(content).toContain('fi');
    });

    it('should wrap PATH export in conditional check for bash', () => {
      const generator = new BashGenerator(mockProjectConfig);
      const toolContents = new Map();

      const content = generator.generateFileContent(toolContents);

      const targetDir = mockProjectConfig.paths.targetDir;
      expect(content).toContain(`if [[ ":$PATH:" != *":${targetDir}:"* ]]; then`);
      expect(content).toContain(`export PATH="${targetDir}:$PATH"`);
      expect(content).toContain('fi');
    });
  });

  describe('should not add duplicate PATH entries', () => {
    it('should only add PATH check once even with multiple tools', () => {
      const generator = new ZshGenerator(mockProjectConfig);
      const toolContents = new Map([
        [
          'tool1',
          {
            toolInit: [],
            pathModifications: [],
            environmentVariables: [],
            completionSetup: [],
            onceScripts: [],
            alwaysScripts: [],
          rawScripts: [],
            functions: {},
          },
        ],
        [
          'tool2',
          {
            toolInit: [],
            pathModifications: [],
            environmentVariables: [],
            completionSetup: [],
            onceScripts: [],
            alwaysScripts: [],
          rawScripts: [],
            functions: {},
          },
        ],
      ]);

      const content = generator.generateFileContent(toolContents);

      const targetDir = mockProjectConfig.paths.targetDir;
      const pathCheckCount = (
        content.match(
          new RegExp(`if \\[\\[ ":\\$PATH:" != \\*":${targetDir.replace(/\//g, '\\/')}:"\\* \\]\\]`, 'g'),
        ) || []
      ).length;
      expect(pathCheckCount).toBe(1);
    });
  });
});
