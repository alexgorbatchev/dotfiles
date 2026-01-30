import type { IInstallContext, Shell } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import { TestLogger } from '@dotfiles/logger';
import assert from 'node:assert';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { installFromCurlScript } from '../installFromCurlScript';
import type { CurlScriptToolConfig } from '../schemas';
import type { ICurlScriptArgsContext } from '../types';

function createMockShell(): {
  shell: Shell;
  mockFn: ReturnType<typeof mock>;
  mockEnv: ReturnType<typeof mock>;
  mockQuiet: ReturnType<typeof mock>;
} {
  const mockQuiet = mock(() => Promise.resolve());
  const mockEnv = mock(() => ({ quiet: mockQuiet }));
  const mockFn = mock(() => ({ env: mockEnv }));
  return { shell: mockFn as unknown as Shell, mockFn, mockEnv, mockQuiet };
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

  it('should execute script with static env when provided', async () => {
    const { shell, mockEnv } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        env: { MY_VAR: 'my-value', ANOTHER_VAR: 'another-value' },
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

    expect(mockEnv).toHaveBeenCalled();
    const envCalls = mockEnv.mock.calls as unknown as [Record<string, string>][];
    expect(envCalls.length).toBe(1);
    const [envArg] = envCalls[0] ?? [];
    expect(envArg).toMatchObject({ MY_VAR: 'my-value', ANOTHER_VAR: 'another-value' });
  });

  it('should execute script with env from function when provided', async () => {
    const { shell, mockEnv } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        env: (ctx: ICurlScriptArgsContext) => ({ INSTALL_DIR: ctx.stagingDir }),
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

    expect(mockEnv).toHaveBeenCalled();
    const envCalls = mockEnv.mock.calls as unknown as [Record<string, string>][];
    expect(envCalls.length).toBe(1);
    const [envArg] = envCalls[0] ?? [];
    expect(envArg).toMatchObject({ INSTALL_DIR: context.stagingDir });
  });

  it('should execute script with env from async function when provided', async () => {
    const { shell, mockEnv } = createMockShell();
    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
        env: async (ctx: ICurlScriptArgsContext) => {
          await Promise.resolve();
          return { FLYCTL_INSTALL: ctx.stagingDir };
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

    expect(mockEnv).toHaveBeenCalled();
    const envCalls = mockEnv.mock.calls as unknown as [Record<string, string>][];
    expect(envCalls.length).toBe(1);
    const [envArg] = envCalls[0] ?? [];
    expect(envArg).toMatchObject({ FLYCTL_INSTALL: context.stagingDir });
  });

  it('should fail when no binaries are installed after script execution', async () => {
    const { shell, mockQuiet } = createMockShell();
    // Mock shell to return script output
    mockQuiet.mockImplementation(() => Promise.resolve({ stdout: 'Script ran successfully', stderr: '' }));

    // Mock fs.exists to return false for binary paths (simulating missing binaries)
    const mockFsWithExists: IFileSystem = {
      chmod: mock(() => Promise.resolve()),
      exists: mock(() => Promise.resolve(false)),
    } as unknown as IFileSystem;

    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
      },
    };

    const result = await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFsWithExists,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(!result.success);
    expect(result.error).toBe(
      'Installation script completed but no binaries were found at expected locations: /install/dir/tool',
    );
  });

  it('should include script output in error when binaries not installed', async () => {
    const { shell, mockQuiet } = createMockShell();
    // Mock shell to return script output
    mockQuiet.mockImplementation(() =>
      Promise.resolve({ stdout: 'Installing to /wrong/dir\nDone!', stderr: 'Warning: something' })
    );

    const mockFsWithExists: IFileSystem = {
      chmod: mock(() => Promise.resolve()),
      exists: mock(() => Promise.resolve(false)),
    } as unknown as IFileSystem;

    const toolConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
      },
    };

    const result = await installFromCurlScript(
      'test-tool',
      toolConfig,
      context,
      undefined,
      mockFsWithExists,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(!result.success);
    expect(result.error).toBe(
      'Installation script completed but no binaries were found at expected locations: /install/dir/tool',
    );
    // Verify script output was logged
    const errorLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'ERROR');
    const logMessages = errorLogs.map((log) => String(log[0]));
    expect(logMessages).toMatchInlineSnapshot(`
[
  "No binaries were installed. Expected at: /install/dir/tool",
  "Install script output:",
  "Installing to /wrong/dir",
  "Done!",
  "Warning: something",
]
`);
  });
});
