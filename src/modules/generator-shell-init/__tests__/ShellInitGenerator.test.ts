import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import {
  createMemFileSystem,
  createMockYamlConfig,
  createTestDirectories,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import type { ToolConfig } from '@types';
import { always } from '@types';
import type { IShellInitGenerator } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';
import { createSectionHeader, generateEndOfFile, generateFileHeader } from '../shellTemplates';

describe('ShellInitGenerator', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let generator: IShellInitGenerator;
  let logger: TestLogger;
  let testDirs: TestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-generator' });

    mockAppConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
      env: {},
    });
    generator = new ShellInitGenerator(logger, mockFileSystem, mockAppConfig);
  });

  const getExpectedHeader = () => generateFileHeader('zsh', testDirs.paths.dotfilesDir);
  const getExpectedFooter = () => generateEndOfFile('zsh');

  it('should generate a basic init file with no tool configs and return its path', async () => {
    const expectedPath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
    const result = await generator.generate({});
    expect(result?.primaryPath).toBe(expectedPath);
    expect(result?.files.get('zsh')).toBe(expectedPath);

    const content = await mockFileSystem.readFile(expectedPath);

    const expectedContent = [
      getExpectedHeader(),
      createSectionHeader('zsh', 'PATH Modifications'),
      '# The following path modifications have been hoisted from tool-specific configurations',
      '# for better organization and to avoid conflicts',
      '',
      `export PATH="${testDirs.paths.binariesDir}:$PATH"`,
      '', // one empty line after path section
      '', // extra newline before end of file
      getExpectedFooter(),
    ].join('\n');

    expect(content).toBe(expectedContent);
    expect(mockFileSystem.ensureDir).toHaveBeenCalledWith(testDirs.paths.shellScriptsDir);
  });

  it('should use custom output path if provided and return it', async () => {
    const customPath = '/custom/path/to/my-main.zsh';
    const result = await generator.generate({}, { outputPath: customPath });
    expect(result?.primaryPath).toBe(customPath);
    expect(result?.files.get('zsh')).toBe(customPath);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(customPath, expect.any(String));
    expect(mockFileSystem.ensureDir).toHaveBeenCalledWith('/custom/path/to');
  });

  it('should attempt file operations and return path (simulating dry run with MemFS)', async () => {
    // With the refactor, ShellInitGenerator always attempts to write.
    // The "dry run" nature comes from the IFileSystem implementation (MemFileSystem here).
    const toolConfigs: Record<string, ToolConfig> = {
      testTool: {
        name: 'testTool',
        binaries: ['tt'],
        version: '1.0.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TEST_TOOL_VAR="hello"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const expectedPath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
    // No dryRun option passed to generate
    const result = await generator.generate(toolConfigs, {});
    expect(result?.primaryPath).toBe(expectedPath);

    // It should now ATTEMPT to write, and MemFileSystem will capture it.
    expect(mockFileSystem.ensureDir).toHaveBeenCalledWith(testDirs.paths.shellScriptsDir);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining('export TEST_TOOL_VAR="hello"')
    );

    // Verify content in MemFileSystem
    const content = await mockFileSystem.readFile(expectedPath);
    expect(content).toContain('export TEST_TOOL_VAR="hello"');
  });

  it('should include PATH modifications from tool configs', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export PATH="/opt/toolA/bin:$PATH"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`path+=("/opt/toolB/bin")`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    expect(content).toContain(createSectionHeader('zsh', 'PATH Modifications'));
    expect(content).toContain(`export PATH="${testDirs.paths.binariesDir}:$PATH"`);
    expect(content).toContain('export PATH="/opt/toolA/bin:$PATH"');
    expect(content).toContain('path+=("/opt/toolB/bin")');
  });

  it('should include environment variables from tool configs', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TOOL_A_ENABLED=true`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TOOL_B_MODE="debug"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    expect(content).toContain(createSectionHeader('zsh', 'Always Scripts'));
    expect(content).toContain('export TOOL_A_ENABLED=true');
    expect(content).toContain('export TOOL_B_MODE="debug"');
  });

  it('should include tool-specific initializations from zshInit', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`alias ta="toolA --extended"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`source /opt/toolB/init.sh`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    expect(content).toContain(createSectionHeader('zsh', 'Always Scripts'));
    expect(content).toContain('alias ta="toolA --extended"');
    expect(content).toContain('source /opt/toolB/init.sh');
  });

  it('should set up Zsh completions correctly', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        completions: {
          zsh: { source: 'completion/toolA.zsh', name: '_toolA_custom' },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '1.0',
        completions: {
          zsh: { source: 'completions/_toolB' }, // Default name _toolB
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    expect(content).toContain(createSectionHeader('zsh', 'Shell Completions Setup'));
    expect(content).toContain('typeset -U fpath');
    expect(content).toContain(`fpath=(${JSON.stringify(path.join(testDirs.paths.shellScriptsDir, 'zsh'))} $fpath)`);
  });

  it('should not add "typeset -U fpath" if fpath is already managed in zshInit', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`typeset -U fpath`, always`fpath=("/my/custom/fpath" $fpath)`],
          },
        },
        completions: { zsh: { source: '_toolA' } },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    const occurrences = (content.match(/typeset -U fpath/g) || []).length;
    expect(occurrences).toBe(2);
    expect(content).toContain('typeset -U fpath');
    expect(content).toContain('fpath=("/my/custom/fpath" $fpath)');
    // The completion specific fpath add should still be there for its own directory
    expect(content).toContain(`fpath=(${JSON.stringify(path.join(testDirs.paths.shellScriptsDir, 'zsh'))} $fpath)`);
  });

  it('should handle mixed configurations for multiple tools', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      alpha: {
        name: 'alpha',
        binaries: ['a'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export ALPHA_MODE=on`, always`export PATH="/opt/alpha/bin:$PATH"`],
          },
        },
        completions: { zsh: { source: '_alpha' } },
        installationMethod: 'none',
        installParams: undefined,
      },
      beta: {
        name: 'beta',
        binaries: ['b'],
        version: '2.1',
        shellConfigs: {
          zsh: {
            scripts: [always`alias b="beta -v"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      gamma: {
        name: 'gamma',
        binaries: ['g'],
        version: '0.5',
        completions: {
          zsh: { source: 'gamma_completion.sh', targetDir: '/usr/local/share/zsh/site-functions' },
        },
        shellConfigs: {
          zsh: {
            scripts: [always`export GAMMA_LEVEL=5`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    // PATH
    expect(content).toContain('export PATH="/opt/alpha/bin:$PATH"');
    expect(content).toContain(`export PATH="${testDirs.paths.binariesDir}:$PATH"`);

    // Env Vars
    expect(content).toContain('export ALPHA_MODE=on');
    expect(content).toContain('export GAMMA_LEVEL=5');

    // Tool Inits - all tools should appear in Always Scripts section
    expect(content).toContain('alias b="beta -v"');

    // Completions
    expect(content).toContain('typeset -U fpath');
    expect(content).toContain(`fpath=(${JSON.stringify(path.join(testDirs.paths.shellScriptsDir, 'zsh'))} $fpath)`); // For alpha
    expect(content).toContain(`fpath=(${JSON.stringify('/usr/local/share/zsh/site-functions')} $fpath)`); // For gamma
  });

  it('should correctly order the sections', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      myTool: {
        name: 'myTool',
        binaries: ['mt'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [
              always`export MY_VAR=123`,
              always`export PATH="/opt/mytool/bin:$PATH"`,
              always`alias mt="myTool --doit"`,
            ],
          },
        },
        completions: { zsh: { source: '_myTool' } },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    const pathSectionIndex = content.indexOf(createSectionHeader('zsh', 'PATH Modifications'));
    const alwaysScriptsSectionIndex = content.indexOf(createSectionHeader('zsh', 'Always Scripts'));
    const compSectionIndex = content.indexOf(createSectionHeader('zsh', 'Shell Completions Setup'));

    expect(pathSectionIndex).toBeGreaterThan(-1);
    expect(alwaysScriptsSectionIndex).toBeGreaterThan(-1);
    expect(compSectionIndex).toBeGreaterThan(-1);

    expect(pathSectionIndex).toBeLessThan(alwaysScriptsSectionIndex);
    expect(alwaysScriptsSectionIndex).toBeLessThan(compSectionIndex);
  });

  it('should deduplicate identical lines within sections', async () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export DUP_VAR="val"`, always`export PATH="/dup/path:$PATH"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export DUP_VAR="val"`, always`export PATH="/dup/path:$PATH"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    // In the new system, each tool gets its own function, so duplicates can exist across tools
    expect((content.match(/export DUP_VAR="val"/g) || []).length).toBe(2);
    expect((content.match(/export PATH="\/dup\/path:\$PATH"/g) || []).length).toBe(2);
  });

  it('should handle tool config being undefined in the input record gracefully', async () => {
    const toolConfigs: Record<string, ToolConfig | undefined> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TOOL_A_VAR="set"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: undefined, // This tool's config is undefined
      toolC: {
        name: 'toolC',
        binaries: ['tc'],
        version: '1.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TOOL_C_VAR="active"`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const result = await generator.generate(toolConfigs as Record<string, ToolConfig>);
    expect(result?.primaryPath).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    const content = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));

    expect(content).toContain('export TOOL_A_VAR="set"');
    expect(content).toContain('export TOOL_C_VAR="active"');
  });
  it('should return null if writeFile fails', async () => {
    const { fs, spies } = await createMemFileSystem();
    spies.writeFile.mockRejectedValueOnce(new Error('Disk full'));
    const logger = new TestLogger();
    const generatorWithFailingWrite = new ShellInitGenerator(logger, fs, mockAppConfig);
    const result = await generatorWithFailingWrite.generate({});
    expect(result).toBeNull();
  });
});
