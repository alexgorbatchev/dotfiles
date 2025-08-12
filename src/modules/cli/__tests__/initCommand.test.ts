import { describe, it, expect, beforeEach, mock, afterAll } from 'bun:test';
import { createCliTestSetup } from './createCliTestSetup';
import { registerInitCommand } from '../initCommand';
import type { GlobalProgram } from '../../../cli';
import { TestLogger } from '@testing-helpers';
import {
  createModuleMocker,
  setupTestCleanup,
} from '@rageltd/bun-test-utils';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

describe('initCommand', () => {
  let program: GlobalProgram;
  let logger: TestLogger;
  let setup: Awaited<ReturnType<typeof createCliTestSetup>>;

  afterAll(() => {
    mockModules.restoreAll();
  });

  beforeEach(async () => {
    // Mock getCliBinPath to return a predictable path BEFORE creating the setup
    await mockModules.mock('@utils/getCliBinPath', () => ({
      getCliBinPath: mock(() => '/mock/bin/dotfiles-generator'),
    }));

    setup = await createCliTestSetup({
      testName: 'init-command',
      memFileSystem: {
        initialVolumeJson: {
          '/mock': null,
          '/mock/bin': null,
          '/mock/bin/generator.d.ts': `
            // Generated type definitions for dotfiles-generator
            declare module "types/archive.types" {
                export type ArchiveFormat = 'auto' | 'tar' | 'tar.gz';
            }
            declare module "types/toolConfigBuilder.types" {
                export interface ToolConfigBuilder {
                    bin(names: string | string[]): this;
                    version(version: string): this;
                }
                export interface ToolConfigContext {
                    toolDir: string;
                    homeDir: string;
                }
            }
          `,
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerInitCommand(logger, program, async () => setup.createServices());
  });

  it('should create all required files in empty directory', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    
    // Verify all files were created using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    
    const expectedFiles = [
      'generator.d.ts',
      'tsconfig.json', 
      'config.yaml',
      'tools/fzf.tool.ts'
    ];
    
    for (const file of expectedFiles) {
      expect(await fs.exists(file)).toBe(true);
    }
  });

  it('should create generator.d.ts with proper TypeScript module declarations', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    
    const services = setup.createServices();
    const { fs } = services;
    const generatorDts = await fs.readFile('generator.d.ts', 'utf8');
    expect(generatorDts).toContain('// Generated type definitions for dotfiles-generator');
    expect(generatorDts).toContain('declare module "types/');
    expect(generatorDts).toContain('export type ArchiveFormat');
    expect(generatorDts).toContain('export interface ToolConfigBuilder');
  });

  it('should create config.yaml with correct paths configuration', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    
    const services = setup.createServices();
    const { fs } = services;
    const configYaml = await fs.readFile('config.yaml', 'utf8');
    expect(configYaml).toContain('generatedDir: ./demo');
    expect(configYaml).toContain('toolConfigsDir: ./tools');
    expect(configYaml).toContain('# Dotfiles Generator Configuration');
  });

  it('should create tsconfig.json with correct TypeScript configuration', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    
    const services = setup.createServices();
    const { fs } = services;
    const tsconfigContent = await fs.readFile('tsconfig.json', 'utf8');
    const tsconfig = JSON.parse(tsconfigContent);
    
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe('ESNext');
    expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
    expect(tsconfig.include).toEqual(['**/*.ts']);
    expect(tsconfig.exclude).toEqual(['node_modules', 'dist']);
  });

  it('should create fzf.tool.ts with correct ToolConfigBuilder format', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    
    const services = setup.createServices();
    const { fs } = services;
    const fzfToolConfig = await fs.readFile('tools/fzf.tool.ts', 'utf8');
    expect(fzfToolConfig).toContain('import type { ToolConfigBuilder, ToolConfigContext }');
    expect(fzfToolConfig).toContain('export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void>');
    expect(fzfToolConfig).toContain('.bin(\'fzf\')');
    expect(fzfToolConfig).toContain('.version(\'latest\')');
    expect(fzfToolConfig).toContain('.install(\'github-release\'');
    expect(fzfToolConfig).toContain('repo: \'junegunn/fzf\'');
    expect(fzfToolConfig).toContain('.completions({');
    expect(fzfToolConfig).toContain('.zsh({');
  });

  it('should fail when generator.d.ts already exists', async () => {
    // Pre-create the file using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    await fs.writeFile('generator.d.ts', 'existing content');
    
    let threwError = false;
    try {
      await program.parseAsync(['node', 'test', 'init']);
    } catch (error: any) {
      threwError = true;
      expect(error.message).toContain('MOCK_EXIT_CLI_CALLED_WITH_1');
    }
    
    expect(threwError).toBe(true);
  });

  it('should fail when tsconfig.json already exists', async () => {
    // Pre-create the file using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    await fs.writeFile('tsconfig.json', '{}');
    
    let threwError = false;
    try {
      await program.parseAsync(['node', 'test', 'init']);
    } catch (error: any) {
      threwError = true;
      expect(error.message).toContain('MOCK_EXIT_CLI_CALLED_WITH_1');
    }
    
    expect(threwError).toBe(true);
  });

  it('should fail when config.yaml already exists', async () => {
    // Pre-create the file using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    await fs.writeFile('config.yaml', 'existing: config');
    
    let threwError = false;
    try {
      await program.parseAsync(['node', 'test', 'init']);
    } catch (error: any) {
      threwError = true;
      expect(error.message).toContain('MOCK_EXIT_CLI_CALLED_WITH_1');
    }
    
    expect(threwError).toBe(true);
  });

  it('should fail when tools/fzf.tool.ts already exists', async () => {
    // Pre-create the file using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    await fs.ensureDir('tools');
    await fs.writeFile('tools/fzf.tool.ts', 'existing tool config');
    
    let threwError = false;
    try {
      await program.parseAsync(['node', 'test', 'init']);
    } catch (error: any) {
      threwError = true;
      expect(error.message).toContain('MOCK_EXIT_CLI_CALLED_WITH_1');
    }
    
    expect(threwError).toBe(true);
  });

  it('should fail when multiple files already exist', async () => {
    // Pre-create multiple files using the filesystem service
    const services = setup.createServices();
    const { fs } = services;
    await fs.writeFile('generator.d.ts', 'existing content');
    await fs.writeFile('config.yaml', 'existing: config');
    
    let threwError = false;
    try {
      await program.parseAsync(['node', 'test', 'init']);
    } catch (error: any) {
      threwError = true;
      expect(error.message).toContain('MOCK_EXIT_CLI_CALLED_WITH_1');
    }
    
    expect(threwError).toBe(true);
  });
});