import { TestLogger, createMemFileSystem, createMockYamlConfig, createTestDirectories } from '@testing-helpers';
import { describe, expect, it, beforeEach } from 'bun:test';
import type { ToolConfigContext, ToolConfigBuilder, AsyncConfigureTool } from '@types';
import type { YamlConfig } from '@modules/config';
import { ToolConfigBuilder as ToolConfigBuilderImpl } from '@modules/tool-config-builder';
import path from 'node:path';

// Helper function to create ToolConfigContext (extracted from loadToolConfigs.ts)
function createToolConfigContext(yamlConfig: YamlConfig, currentToolName: string): ToolConfigContext {
  const getToolDir = (toolName: string): string => {
    return path.join(yamlConfig.paths.binariesDir, toolName);
  };

  return {
    toolDir: getToolDir(currentToolName),
    getToolDir,
    homeDir: yamlConfig.paths.homeDir,
    binDir: yamlConfig.paths.targetDir,
    shellScriptsDir: yamlConfig.paths.shellScriptsDir,
    dotfilesDir: yamlConfig.paths.dotfilesDir,
    generatedDir: yamlConfig.paths.generatedDir,
  };
}

describe('ToolConfigContext', () => {
  let logger: TestLogger;
  let mockYamlConfig: YamlConfig;

  beforeEach(async () => {
    logger = new TestLogger();
    
    const mockFs = await createMemFileSystem({});
    const testDirs = await createTestDirectories(logger, mockFs.fs, { testName: 'toolconfig-context-test' });
    
    mockYamlConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFs.fs,
      logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
      env: {},
    });
  });

  describe('Context creation and path resolution', () => {
    it('should create context with correct paths from yamlConfig', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'test-tool');
      
      expect(context.toolDir).toBe(path.join(mockYamlConfig.paths.binariesDir, 'test-tool'));
      expect(context.homeDir).toBe(mockYamlConfig.paths.homeDir);
      expect(context.binDir).toBe(mockYamlConfig.paths.targetDir);
      expect(context.shellScriptsDir).toBe(mockYamlConfig.paths.shellScriptsDir);
      expect(context.dotfilesDir).toBe(mockYamlConfig.paths.dotfilesDir);
      expect(context.generatedDir).toBe(mockYamlConfig.paths.generatedDir);
      expect(typeof context.getToolDir).toBe('function');
    });

    it('should provide getToolDir method that works for any tool name', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'my-tool');
      
      expect(context.getToolDir('my-tool')).toBe(path.join(mockYamlConfig.paths.binariesDir, 'my-tool'));
      expect(context.getToolDir('some-other-tool')).toBe(path.join(mockYamlConfig.paths.binariesDir, 'some-other-tool'));
      expect(context.getToolDir('fzf')).toBe(path.join(mockYamlConfig.paths.binariesDir, 'fzf'));
    });

    it('should work correctly with ToolConfigBuilder and context', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'shell-tool');
      const builder = new ToolConfigBuilderImpl(logger, 'shell-tool');
      
      // Test that context can be used in a tool configuration function
      const configureToolFn: AsyncConfigureTool = async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
        c.bin('shell-tool')
         .version('latest')
         .install('manual', { binaryPath: '/usr/bin/shell-tool' })
         .zsh(/* zsh */`
           export TOOL_DIR="${ctx.toolDir}"
           export HOME_DIR="${ctx.homeDir}"
           export GENERATED_DIR="${ctx.generatedDir}"
           
           # Source tool-specific files
           if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
             source "${ctx.toolDir}/shell/key-bindings.zsh"
           fi
         ` as any);
      };
      
      await configureToolFn(builder, context);
      const toolConfig = builder.build();
      
      expect(toolConfig).toBeDefined();
      expect(toolConfig.name).toBe('shell-tool');
      expect(toolConfig.zshInit).toBeDefined();
      expect(toolConfig.zshInit![0]).toContain(mockYamlConfig.paths.binariesDir);
      expect(toolConfig.zshInit![0]).toContain(mockYamlConfig.paths.homeDir);
      expect(toolConfig.zshInit![0]).toContain(mockYamlConfig.paths.generatedDir);
    });

    it('should handle tool dependencies using getToolDir', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'dependent-tool');
      const builder = new ToolConfigBuilderImpl(logger, 'dependent-tool');
      
      // Test a tool that references other tools
      const configureToolFn: AsyncConfigureTool = async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
        c.bin('dependent-tool')
         .version('latest')
         .install('manual', { binaryPath: '/usr/bin/dependent-tool' })
         .zsh(/* zsh */`
           # Reference another tool's directory
           FZF_DIR="${ctx.getToolDir('fzf')}"
           if [[ -d "$FZF_DIR" ]]; then
             export FZF_BASE="$FZF_DIR"
           fi
           
           # Use current tool directory
           export DEPENDENT_TOOL_CONFIG="${ctx.toolDir}/config.yaml"
         ` as any);
      };
      
      await configureToolFn(builder, context);
      const toolConfig = builder.build();
      
      expect(toolConfig.zshInit).toBeDefined();
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.binariesDir, 'fzf'));
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.binariesDir, 'dependent-tool', 'config.yaml'));
    });


    it('should handle tools that generate completions to the correct directory', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'completion-tool');
      const builder = new ToolConfigBuilderImpl(logger, 'completion-tool');
      
      // Test a tool that generates completions
      const configureToolFn: AsyncConfigureTool = async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
        c.bin('completion-tool')
         .version('latest')
         .install('manual', { binaryPath: '/usr/bin/completion-tool' })
         .zsh(/* zsh */`
           # Generate completions to the proper directory
           if command -v completion-tool >/dev/null 2>&1; then
             completion-tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_completion-tool"
           fi
         ` as any);
      };
      
      await configureToolFn(builder, context);
      const toolConfig = builder.build();
      
      expect(toolConfig.zshInit).toBeDefined();
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.generatedDir, 'completions/_completion-tool'));
    });
  });

  describe('Custom path resolution', () => {
    it('should create correct paths based on yamlConfig values', async () => {
      // Test with custom paths in yamlConfig  
      const customMockFs = await createMemFileSystem({});
      const customTestDirs = await createTestDirectories(logger, customMockFs.fs, { 
        testName: 'custom-path-test'
      });
      
      const customYamlConfig = await createMockYamlConfig({
        config: {
          paths: {
            ...customTestDirs.paths,
            binariesDir: '/custom/dotfiles/.custom-generated/custom-tools',
          },
        },
        filePath: path.join(customTestDirs.paths.dotfilesDir, 'config.yaml'),
        fileSystem: customMockFs.fs,
        logger,
        systemInfo: { platform: 'linux', arch: 'x64', homeDir: customTestDirs.paths.homeDir },
        env: {},
      });

      const context = createToolConfigContext(customYamlConfig, 'custom-path-tool');
      
      expect(context.homeDir).toBe(customYamlConfig.paths.homeDir);
      expect(context.dotfilesDir).toBe(customYamlConfig.paths.dotfilesDir);
      expect(context.generatedDir).toBe(customYamlConfig.paths.generatedDir);
      expect(context.toolDir).toBe(path.join(customYamlConfig.paths.binariesDir, 'custom-path-tool'));
      expect(context.getToolDir('another-tool')).toBe(path.join(customYamlConfig.paths.binariesDir, 'another-tool'));
    });
  });

  describe('Backward compatibility', () => {
    it('should support old-style tool configuration functions without context parameter', async () => {
      const builder = new ToolConfigBuilderImpl(logger, 'old-style-tool');
      
      // Test that old-style functions still work (they will just ignore the context)
      const oldStyleConfigureToolFn = async (c: ToolConfigBuilder): Promise<void> => {
        c.bin('old-style-tool')
         .version('latest')
         .install('manual', { binaryPath: '/usr/bin/old-style-tool' });
      };
      
      // This should not throw an error, even though the function signature doesn't include context
      await (oldStyleConfigureToolFn as any)(builder, createToolConfigContext(mockYamlConfig, 'old-style-tool'));
      const toolConfig = builder.build();
      
      expect(toolConfig.name).toBe('old-style-tool');
      expect(toolConfig.binaries).toContain('old-style-tool');
    });
  });

  describe('Real-world tool patterns', () => {
    it('should work with fzf-like tool pattern', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'fzf-like');
      const builder = new ToolConfigBuilderImpl(logger, 'fzf-like');
      
      // Test fzf-like pattern with context
      const configureToolFn: AsyncConfigureTool = async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
        c.bin('fzf-like')
         .version('latest')
         .install('github-release', { repo: 'owner/fzf-like' })
         .completions({
           zsh: { source: 'shell/completion.zsh' },
         })
         .zsh(/* zsh */`
           export FZF_LIKE_DEFAULT_OPTS="--color=fg+:cyan"
           
           # Source key bindings
           _fzf_like_install_dir="${ctx.toolDir}"
           if [ -f "$_fzf_like_install_dir/shell/key-bindings.zsh" ]; then
             source "$_fzf_like_install_dir/shell/key-bindings.zsh"
           fi
         ` as any);
      };
      
      await configureToolFn(builder, context);
      const toolConfig = builder.build();
      
      expect(toolConfig.installationMethod).toBe('github-release');
      expect(toolConfig.completions).toBeDefined();
      expect(toolConfig.zshInit).toBeDefined();
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.binariesDir, 'fzf-like'));
    });

    it('should work with atuin-like tool pattern', async () => {
      const context = createToolConfigContext(mockYamlConfig, 'atuin-like');
      const builder = new ToolConfigBuilderImpl(logger, 'atuin-like');
      
      // Test atuin-like pattern with context
      const configureToolFn: AsyncConfigureTool = async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
        c.bin('atuin-like')
         .version('latest')
         .install('github-release', { repo: 'owner/atuin-like' })
         .symlink('./config.toml', '~/.config/atuin-like/config.toml')
         .zsh(/* zsh */`
           export ATUIN_LIKE_CONFIG_DIR="${ctx.toolDir}"
           
           # Generate completions
           if command -v atuin-like >/dev/null 2>&1; then
             atuin-like gen-completions --shell zsh > "${ctx.generatedDir}/completions/_atuin-like" 2>/dev/null || true
           fi
         ` as any);
      };
      
      await configureToolFn(builder, context);
      const toolConfig = builder.build();
      
      expect(toolConfig.symlinks).toBeDefined();
      expect(toolConfig.zshInit).toBeDefined();
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.binariesDir, 'atuin-like'));
      expect(toolConfig.zshInit![0]).toContain(path.join(mockYamlConfig.paths.generatedDir, 'completions/_atuin-like'));
    });
  });
});