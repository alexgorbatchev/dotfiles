import type { IInstallContext, Shell } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { installFromCurlScript } from '../installFromCurlScript';
import type { CurlScriptToolConfig } from '../schemas';
import type { ICurlScriptArgsContext } from '../types';

function createMockShell(): { shell: Shell; mockFn: ReturnType<typeof mock>; mockQuiet: ReturnType<typeof mock>; } {
  const mockQuiet = mock(() => Promise.resolve());
  const mockEnv = mock(() => ({ quiet: mockQuiet }));
  const mockFn = mock(() => ({ env: mockEnv }));
  return { shell: mockFn as unknown as Shell, mockFn, mockQuiet };
}

describe('installFromCurlScript', () => {
  let logger: TestLogger;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockHookExecutor: HookExecutor;
  let context: IInstallContext;

  beforeEach(() => {
    logger = new TestLogger();
    mockFs = {
      chmod: mock(() => Promise.resolve()),
    } as unknown as IFileSystem;
    mockDownloader = {
      download: mock(() => Promise.resolve('/path/to/download')),
    } as unknown as IDownloader;
    mockHookExecutor = {
      executeHook: mock(() => Promise.resolve({ success: true })),
    } as unknown as HookExecutor;
    context = {
      stagingDir: '/install/dir',
      version: '1.0.0',
      projectConfig: {
        paths: {
          binariesDir: '/path/to/binaries',
          homeDir: '/home/user',
          dotfilesDir: '/home/user/.dotfiles',
          targetDir: '/home/user/.local/bin',
          generatedDir: '/home/user/.dotfiles/.generated',
          toolConfigsDir: '/home/user/.dotfiles/tools',
          shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
        },
      },
    } as unknown as IInstallContext;
  });

  it('should execute script with args when provided', async () => {
    const { shell, mockFn } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        args: ['--arg1', '--arg2'],
      },
    };

    await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    expect(mockFn).toHaveBeenCalled();
    // Verify arguments passed to $
    // The first call to $ should be with template strings and values
    // $`bash ${scriptPath} ${args}`
    // arguments: [strings, scriptPath, args]
    const calls = mockFn.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error('Expected call');
    const [strings, scriptPath, args] = call;

    if (!strings || !strings[0]) throw new Error('Expected strings');
    expect(strings[0]).toContain('bash');
    expect(scriptPath).toContain('test-tool-install.sh');
    expect(args).toEqual(['--arg1', '--arg2']);
  });

  it('should execute script without args when not provided', async () => {
    const { shell, mockFn } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'sh',
      },
    };

    await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    expect(mockFn).toHaveBeenCalled();
    const calls = mockFn.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error('Expected call');
    const [strings, scriptPath, args] = call;

    if (!strings || !strings[0]) throw new Error('Expected strings');
    expect(strings[0]).toContain('sh');
    expect(scriptPath).toContain('test-tool-install.sh');
    expect(args).toEqual([]);
  });

  it('should execute script with args from function when provided', async () => {
    const { shell, mockFn } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        args: (ctx: ICurlScriptArgsContext) => ['--install-dir', ctx.stagingDir, '--skip-shell'],
      },
    };

    await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    expect(mockFn).toHaveBeenCalled();
    const calls = mockFn.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error('Expected call');
    const [strings, scriptPath, args] = call;

    if (!strings || !strings[0]) throw new Error('Expected strings');
    expect(strings[0]).toContain('bash');
    expect(scriptPath).toContain('test-tool-install.sh');
    expect(args).toEqual(['--install-dir', context.stagingDir, '--skip-shell']);
  });

  it('should execute script with args from async function when provided', async () => {
    const { shell, mockFn } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        args: async (ctx: ICurlScriptArgsContext) => {
          // Simulate async operation
          await Promise.resolve();
          return ['--install-dir', ctx.stagingDir, '--skip-shell'];
        },
      },
    };

    await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    expect(mockFn).toHaveBeenCalled();
    const calls = mockFn.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error('Expected call');
    const [strings, scriptPath, args] = call;

    if (!strings || !strings[0]) throw new Error('Expected strings');
    expect(strings[0]).toContain('bash');
    expect(scriptPath).toContain('test-tool-install.sh');
    expect(args).toEqual(['--install-dir', context.stagingDir, '--skip-shell']);
  });
});
