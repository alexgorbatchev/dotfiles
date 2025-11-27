import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { InstallContext } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import { TestLogger } from '@dotfiles/logger';
import { installFromCurlScript } from '../installFromCurlScript';
import type { CurlScriptToolConfig } from '../schemas';

// Mock Bun $
const mockQuiet = mock(() => Promise.resolve());
const mockShell = mock(() => ({
  quiet: mockQuiet,
}));
mock.module('../shell', () => ({
  shell: mockShell,
}));

describe('installFromCurlScript', () => {
  let logger: TestLogger;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockHookExecutor: HookExecutor;
  let context: InstallContext;

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
      installDir: '/install/dir',
      version: '1.0.0',
    } as unknown as InstallContext;

    mockShell.mockClear();
    mockQuiet.mockClear();
  });

  it('should execute script with args when provided', async () => {
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
      logger
    );

    expect(mockShell).toHaveBeenCalled();
    // Verify arguments passed to $
    // The first call to $ should be with template strings and values
    // $`bash ${scriptPath} ${args}`
    // arguments: [strings, scriptPath, args]
    const calls = mockShell.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
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
      logger
    );

    expect(mockShell).toHaveBeenCalled();
    const calls = mockShell.mock.calls as unknown as [TemplateStringsArray, string, string[]][];
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error('Expected call');
    const [strings, scriptPath, args] = call;
    
    if (!strings || !strings[0]) throw new Error('Expected strings');
    expect(strings[0]).toContain('sh');
    expect(scriptPath).toContain('test-tool-install.sh');
    expect(args).toEqual([]);
  });
});
