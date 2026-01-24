import { always } from '@dotfiles/core';
import { beforeEach, describe, expect, it } from 'bun:test';
import type { IShellInitContent } from '../IShellGenerator';
import { ZshGenerator } from '../ZshGenerator';
import { createMockProjectConfigWithPathsOnly } from './createMockProjectConfigWithPathsOnly';

describe('ZshGenerator - Script Grouping', () => {
  let generator: ZshGenerator;

  beforeEach(() => {
    generator = new ZshGenerator(createMockProjectConfigWithPathsOnly());
  });

  it('should group all tool scripts (always scripts, aliases) under a single tool header', () => {
    const toolContents: Map<string, IShellInitContent> = new Map([
      [
        'tool1',
        {
          configFilePath: '/path/to/tools/tool1.tool.ts',
          toolInit: ['alias t1="tool1"'],
          pathModifications: [],
          environmentVariables: [],
          completionSetup: [],
          onceScripts: [],
          alwaysScripts: [always(`source "/path/to/tool1/init"`), always(`eval "$(tool1 env)"`)],
          functions: {},
        },
      ],
      [
        'tool2',
        {
          configFilePath: '/path/to/tools/tool2.tool.ts',
          toolInit: ['alias t2="tool2"', 'alias t2d="tool2 --debug"'],
          pathModifications: [],
          environmentVariables: [],
          completionSetup: [],
          onceScripts: [],
          alwaysScripts: [always(`eval "$(tool2 init)"`)],
          functions: {},
        },
      ],
    ]);

    const content = generator.generateFileContent(toolContents);

    // Find the tool1 header position and its content
    const tool1HeaderIndex = content.indexOf('/path/to/tools/tool1.tool.ts');
    expect(tool1HeaderIndex).toBeGreaterThan(-1);

    // Find the tool2 header position
    const tool2HeaderIndex = content.indexOf('/path/to/tools/tool2.tool.ts');
    expect(tool2HeaderIndex).toBeGreaterThan(-1);

    // Tool1's always scripts should appear AFTER tool1's header and BEFORE tool2's header
    const tool1SourceIndex = content.indexOf('source "/path/to/tool1/init"');
    const tool1EvalIndex = content.indexOf('eval "$(tool1 env)"');
    const tool1AliasIndex = content.indexOf('alias t1="tool1"');

    expect(tool1SourceIndex).toBeGreaterThan(tool1HeaderIndex);
    expect(tool1SourceIndex).toBeLessThan(tool2HeaderIndex);
    expect(tool1EvalIndex).toBeGreaterThan(tool1HeaderIndex);
    expect(tool1EvalIndex).toBeLessThan(tool2HeaderIndex);
    expect(tool1AliasIndex).toBeGreaterThan(tool1HeaderIndex);
    expect(tool1AliasIndex).toBeLessThan(tool2HeaderIndex);

    // Tool2's always scripts should appear AFTER tool2's header
    const tool2EvalIndex = content.indexOf('eval "$(tool2 init)"');
    const tool2AliasIndex = content.indexOf('alias t2="tool2"');
    const tool2DebugAliasIndex = content.indexOf('alias t2d="tool2 --debug"');

    expect(tool2EvalIndex).toBeGreaterThan(tool2HeaderIndex);
    expect(tool2AliasIndex).toBeGreaterThan(tool2HeaderIndex);
    expect(tool2DebugAliasIndex).toBeGreaterThan(tool2HeaderIndex);
  });

  it('should use simplified tool header format with just file path', () => {
    const toolContents: Map<string, IShellInitContent> = new Map([
      [
        'my-tool',
        {
          configFilePath: '/path/to/tools/my-tool.tool.ts',
          toolInit: ['alias mt="my-tool"'],
          pathModifications: [],
          environmentVariables: [],
          completionSetup: [],
          onceScripts: [],
          alwaysScripts: [],
          functions: {},
        },
      ],
    ]);

    const content = generator.generateFileContent(toolContents);

    // Header should be:
    // # ==============================================================================
    // # /path/to/tools/my-tool.tool.ts
    // # ==============================================================================
    expect(content).toContain('# ==============================================================================');
    expect(content).toContain('# /path/to/tools/my-tool.tool.ts');

    // Should NOT contain redundant "Configuration from:" or "Tool:" lines
    expect(content).not.toContain('Configuration from:');
    expect(content).not.toContain('Tool: my-tool');
  });

  it('should not have a separate Always Scripts section', () => {
    const toolContents: Map<string, IShellInitContent> = new Map([
      [
        'tool1',
        {
          configFilePath: '/path/to/tools/tool1.tool.ts',
          toolInit: [],
          pathModifications: [],
          environmentVariables: [],
          completionSetup: [],
          onceScripts: [],
          alwaysScripts: [always(`source "/path/to/something"`)],
          functions: {},
        },
      ],
    ]);

    const content = generator.generateFileContent(toolContents);

    // Should NOT have a separate "Always Scripts" section header
    expect(content).not.toContain('Always Scripts');
  });
});
