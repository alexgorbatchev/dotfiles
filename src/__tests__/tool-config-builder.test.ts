import { describe, it, expect, beforeEach } from 'bun:test';
import type {
  ToolConfigBuilder as IToolConfigBuilder,
  ToolConfig,
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  PipInstallParams,
  ManualInstallParams,
  AsyncInstallHook,
  InstallHookContext,
} from '../types';
import { ToolConfigBuilder } from '../tool-config-builder'; // Import the actual builder

// The MockToolConfigBuilder class is no longer needed as tests will use the actual ToolConfigBuilder.

describe('ToolConfigBuilder', () => {
  // Updated describe title
  let builder: ToolConfigBuilder; // Use actual ToolConfigBuilder type
  const toolName = 'test-tool';

  beforeEach(() => {
    builder = new ToolConfigBuilder(toolName); // Instantiate actual ToolConfigBuilder
  });

  it('should set the tool name', () => {
    const config = builder.getConfig();
    expect(config.name).toBe(toolName);
  });

  it('should set a single binary name', () => {
    builder.bin('mytool');
    const config = builder.getConfig();
    expect(config.binaries).toEqual(['mytool']);
  });

  it('should set multiple binary names', () => {
    builder.bin(['mytool', 'mytool-alias']);
    const config = builder.getConfig();
    expect(config.binaries).toEqual(['mytool', 'mytool-alias']);
  });

  it('should set the version', () => {
    builder.version('1.2.3');
    const config = builder.getConfig();
    expect(config.version).toBe('1.2.3');
  });

  it('should default version to "latest"', () => {
    const config = builder.getConfig();
    expect(config.version).toBe('latest');
  });

  it('should configure github-release installation', () => {
    const params: GithubReleaseInstallParams = { repo: 'owner/repo', assetPattern: '*.zip' };
    builder.install('github-release', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('github-release');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should configure brew installation', () => {
    const params: BrewInstallParams = { formula: 'myformula', cask: true };
    builder.install('brew', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('brew');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should configure curl-script installation', () => {
    const params: CurlScriptInstallParams = { url: 'http://example.com/install.sh', shell: 'bash' };
    builder.install('curl-script', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('curl-script');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should configure curl-tar installation', () => {
    const params: CurlTarInstallParams = {
      url: 'http://example.com/tool.tar.gz',
      extractPath: 'bin/tool',
    };
    builder.install('curl-tar', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('curl-tar');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should configure pip installation', () => {
    const params: PipInstallParams = { packageName: 'mypackage' };
    builder.install('pip', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('pip');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should configure manual installation', () => {
    const params: ManualInstallParams = { binaryPath: '/usr/local/bin/tool' };
    builder.install('manual', params);
    const config = builder.getConfig();
    expect(config.installMethod).toBe('manual');
    expect(config.installParams).toEqual({ ...params, hooks: {} });
  });

  it('should add Zsh initialization code', () => {
    const zshCode = 'alias tt="echo test"';
    builder.zsh(zshCode);
    const config = builder.getConfig();
    expect(config.zshContent).toEqual([zshCode]);
  });

  it('should append multiple Zsh initialization codes', () => {
    builder.zsh('alias t1="echo 1"');
    builder.zsh('export T2=2');
    const config = builder.getConfig();
    expect(config.zshContent).toEqual(['alias t1="echo 1"', 'export T2=2']);
  });

  it('should add a symbolic link', () => {
    builder.symlink('src/config.json', '.config/tool/config.json');
    const config = builder.getConfig();
    expect(config.symlinks).toEqual([
      { source: 'src/config.json', target: '.config/tool/config.json' },
    ]);
  });

  it('should add multiple symbolic links', () => {
    builder.symlink('s1', 't1');
    builder.symlink('s2', 't2');
    const config = builder.getConfig();
    expect(config.symlinks).toEqual([
      { source: 's1', target: 't1' },
      { source: 's2', target: 't2' },
    ]);
  });

  it('should configure architecture-specific overrides', () => {
    const osArch = 'darwin-aarch64';
    builder.arch(osArch, (macBuilder) => {
      macBuilder.version('1.0.0-mac');
      macBuilder.install('brew', { formula: 'test-tool-mac' });
      macBuilder.zsh('alias mactool="test-tool-mac"');
    });
    // Get the config resolved for the specific architecture
    const config = builder.getConfig(osArch);
    expect(config.version).toBe('1.0.0-mac');
    expect(config.installMethod).toBe('brew');
    expect((config.installParams as BrewInstallParams)?.formula).toBe('test-tool-mac');
    expect(config.zshContent).toContain('alias mactool="test-tool-mac"');

    // Check that base config is not affected
    const baseConfig = builder.getConfig();
    expect(baseConfig.version).toBe('latest'); // Default
    expect(baseConfig.installMethod).toBeUndefined();
    expect(baseConfig.zshContent).toEqual([]);
  });

  it('should allow chaining of methods', () => {
    builder
      .bin('chained-tool')
      .version('0.1.0')
      .install('manual', { binaryPath: '/opt/bin/chained' })
      .zsh('alias ct="chained-tool"')
      .symlink('conf.yaml', '.chained-tool/conf.yaml');
    const config = builder.getConfig();
    expect(config.name).toBe(toolName); // Name is set in constructor
    expect(config.binaries).toEqual(['chained-tool']);
    expect(config.version).toBe('0.1.0');
    expect(config.installMethod).toBe('manual');
    expect(config.zshContent).toContain('alias ct="chained-tool"');
    expect(config.symlinks).toEqual([{ source: 'conf.yaml', target: '.chained-tool/conf.yaml' }]);
  });

  it('should add hooks via install params', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const afterInstallHook: AsyncInstallHook = async (ctx: InstallHookContext) => {
      // console.log('Installed'); // Keep console logs out of tests
    };
    builder.install('github-release', {
      repo: 'owner/repo',
      hooks: { afterInstall: afterInstallHook },
    });
    const config = builder.getConfig();
    expect(config.hooks?.afterInstall).toBe(afterInstallHook);
    expect(config.installParams?.hooks?.afterInstall).toBe(afterInstallHook);
  });

  it('should add hooks via hooks() method', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const beforeInstallHook: AsyncInstallHook = async (ctx: InstallHookContext) => {
      // console.log('Preparing install');
    };
    builder.install('manual', { binaryPath: '/bin/true' }); // Need an install method first
    builder.hooks({ beforeInstall: beforeInstallHook });
    const config = builder.getConfig();
    expect(config.hooks?.beforeInstall).toBe(beforeInstallHook);
    expect(config.installParams?.hooks?.beforeInstall).toBe(beforeInstallHook);
  });

  it('should merge hooks from install() and hooks() method, with hooks() taking precedence for overlaps', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const hook1: AsyncInstallHook = async (ctx) => {}; // afterDownload from install()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const hook2: AsyncInstallHook = async (ctx) => {}; // afterInstall from install()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const hook3: AsyncInstallHook = async (ctx) => {}; // afterInstall from hooks() - should override hook2
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const hook4: AsyncInstallHook = async (ctx) => {}; // beforeInstall from hooks()

    builder.install('manual', {
      binaryPath: '/bin/true',
      hooks: { afterDownload: hook1, afterInstall: hook2 },
    });
    builder.hooks({ afterInstall: hook3, beforeInstall: hook4 });

    const config = builder.getConfig();
    expect(config.hooks?.afterDownload).toBe(hook1);
    expect(config.hooks?.afterInstall).toBe(hook3); // hook3 from .hooks() overrides hook2 from .install()
    expect(config.hooks?.beforeInstall).toBe(hook4);

    // Also check installParams.hooks for consistency, though primary assertion is on config.hooks
    expect(config.installParams?.hooks?.afterDownload).toBe(hook1);
    expect(config.installParams?.hooks?.afterInstall).toBe(hook3);
    expect(config.installParams?.hooks?.beforeInstall).toBe(hook4);
  });
});
