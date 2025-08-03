import { describe, it, beforeEach, expect } from 'bun:test';
import { TestLogger, createMemFileSystem, type MemFileSystemReturn } from '@testing-helpers';
import { Installer } from '../Installer';
import type { IDownloader } from '@modules/downloader';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IArchiveExtractor } from '@modules/extractor';
import type { YamlConfig } from '@modules/config';
import type { GithubReleaseToolConfig } from '@types';
import type { EnhancedInstallHookContext } from '../HookExecutor';
import { mock } from 'bun:test';
import path from 'node:path';

/**
 * Integration tests demonstrating real-world hook usage scenarios
 */
describe('Hook Integration Tests', () => {
  let logger: TestLogger;
  let installer: Installer;
  let memFs: MemFileSystemReturn;
  let mockDownloader: IDownloader;
  let mockGitHubClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockConfig: YamlConfig;

  beforeEach(async () => {
    logger = new TestLogger();
    memFs = await createMemFileSystem();

    // Setup filesystem to track operations
    const fileSystemOperations: Array<{ operation: string; args: any[] }> = [];
    
    // Wrap filesystem operations to track them
    const originalEnsureDir = memFs.spies.ensureDir;
    const originalWriteFile = memFs.spies.writeFile;
    const originalCopyFile = memFs.spies.copyFile;
    const originalChmod = memFs.spies.chmod;
    
    memFs.spies.ensureDir = mock(async (path) => {
      fileSystemOperations.push({ operation: 'ensureDir', args: [path] });
      return originalEnsureDir(path);
    });
    
    memFs.spies.writeFile = mock(async (path, content) => {
      fileSystemOperations.push({ operation: 'writeFile', args: [path, content] });
      return originalWriteFile(path, content);
    });
    
    memFs.spies.copyFile = mock(async (src, dest) => {
      fileSystemOperations.push({ operation: 'copyFile', args: [src, dest] });
      return originalCopyFile(src, dest);
    });
    
    memFs.spies.chmod = mock(async (path, mode) => {
      fileSystemOperations.push({ operation: 'chmod', args: [path, mode] });
      return originalChmod(path, mode);
    });

    // Store operations for test assertions
    (memFs.fs as any).operations = fileSystemOperations;

    mockDownloader = {
      download: mock(async (_url: string, options?: any) => {
        // Mock the actual download by creating the destination file
        if (options?.destinationPath) {
          await memFs.fs.writeFile(options.destinationPath, 'mock-downloaded-file-content');
        }
      }),
      registerStrategy: mock(),
      downloadToFile: mock(),
    } as IDownloader;

    mockGitHubClient = {
      getLatestRelease: mock(() => Promise.resolve({
        id: 12345,
        tag_name: '1.2.3',
        html_url: 'https://github.com/example/tool/releases/tag/v1.2.3',
        published_at: '2023-01-01T00:00:00Z',
        created_at: '2023-01-01T00:00:00Z',
        name: 'Release v1.2.3',
        draft: false,
        prerelease: false,
        assets: [{
          id: 123,
          name: 'tool-darwin-arm64.tar.gz',
          browser_download_url: 'https://github.com/example/tool/releases/download/v1.2.3/tool-darwin-arm64.tar.gz',
          size: 1024000,
          content_type: 'application/gzip',
          state: 'uploaded',
          download_count: 42,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }]
      })),
      getReleaseByTag: mock(),
      getAllReleases: mock(),
      getReleaseByConstraint: mock(),
      getRateLimit: mock(),
    } as IGitHubApiClient;

    mockArchiveExtractor = {
      extract: mock(async (_archivePath: string, options?: any) => {
        // Mock the extraction by creating extracted files in the target directory
        const targetDir = options?.targetDir;
        if (targetDir) {
          await memFs.fs.ensureDir(targetDir);
          await memFs.fs.writeFile(`${targetDir}/tool`, 'mock-binary-content');
          await memFs.fs.writeFile(`${targetDir}/README.md`, 'mock-readme');
          await memFs.fs.writeFile(`${targetDir}/LICENSE`, 'mock-license');
        }
        return {
          extractedFiles: ['tool', 'README.md', 'LICENSE'],
          executables: ['tool']
        };
      }),
      detectFormat: mock(),
      isSupported: mock(),
    } as IArchiveExtractor;

    mockConfig = {
      paths: {
        generatedDir: '/app/generated',
        binariesDir: '/app/generated/binaries',
      },
      github: {
        host: 'github.com',
      },
    } as YamlConfig;

    installer = new Installer(
      logger,
      memFs.fs,
      mockDownloader,
      mockGitHubClient,
      mockArchiveExtractor,
      mockConfig
    );
  });

  describe('Real-world hook scenarios', () => {
    it('should handle configuration setup hook that creates config files', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'example-tool',
        binaries: ['tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/tool',
          hooks: {
            afterInstall: (async (context: EnhancedInstallHookContext) => {
              // Create a config directory
              const configDir = path.join(context.installDir, 'config');
              await context.fileSystem.ensureDir(configDir);
              
              // Create a default configuration file
              const configPath = path.join(configDir, 'default.yaml');
              const configContent = `# Default configuration for ${context.toolName}\\nversion: ${context.version}\\ninstall_dir: ${context.installDir}`;
              await context.fileSystem.writeFile(configPath, configContent);
              
              // Make the main binary executable with specific permissions
              if (context.binaryPath) {
                await context.fileSystem.chmod(context.binaryPath, 0o755);
              }
              
              context.logger.info('Configuration setup completed');
              context.otherChanges.push('Created default configuration file');
              context.otherChanges.push('Set executable permissions on binary');
            }) as any,
          },
        },
      };

      const result = await installer.install('example-tool', toolConfig);

      expect(result.success).toBe(true);
      
      const operations = (memFs.fs as any).operations;
      
      // Verify config directory was created
      expect(operations).toContainEqual({
        operation: 'ensureDir',
        args: ['/app/generated/binaries/example-tool/config']
      });
      
      // Verify config file was written
      expect(operations.some((op: any) => 
        op.operation === 'writeFile' && 
        op.args[0].endsWith('config/default.yaml')
      )).toBe(true);
      
      // Verify binary permissions were set
      expect(operations.some((op: any) => 
        op.operation === 'chmod' && 
        op.args[1] === 0o755
      )).toBe(true);

      expect(result.otherChanges).toContain('Created default configuration file');
      expect(result.otherChanges).toContain('Set executable permissions on binary');
    });

    it('should handle post-extraction binary organization hook', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'multi-binary-tool',
        binaries: ['main-tool', 'helper-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/multi-binary-tool',
          hooks: {
            afterExtract: (async (context: EnhancedInstallHookContext) => {
              if (!context.extractDir || !context.extractResult) {
                throw new Error('No extraction results available');
              }
              
              // Organize binaries in a bin subdirectory
              const binDir = path.join(context.installDir, 'bin');
              await context.fileSystem.ensureDir(binDir);
              
              // Copy executables to bin directory
              for (const executable of context.extractResult.executables || []) {
                const srcPath = path.join(context.extractDir, executable);
                const destPath = path.join(binDir, executable);
                await context.fileSystem.copyFile(srcPath, destPath);
                await context.fileSystem.chmod(destPath, 0o755);
                context.otherChanges.push(`Organized ${executable} into bin directory`);
              }
              
              // Copy documentation files
              const docFiles = context.extractResult.extractedFiles.filter(file => 
                file.includes('README') || file.includes('LICENSE')
              );
              
              if (docFiles.length > 0) {
                const docDir = path.join(context.installDir, 'docs');
                await context.fileSystem.ensureDir(docDir);
                
                for (const docFile of docFiles) {
                  const srcPath = path.join(context.extractDir, docFile);
                  const destPath = path.join(docDir, docFile);
                  await context.fileSystem.copyFile(srcPath, destPath);
                }
                
                context.otherChanges.push('Organized documentation files');
              }
              
              context.logger.info('Binary organization completed');
            }) as any,
          },
        },
      };

      const result = await installer.install('multi-binary-tool', toolConfig);

      expect(result.success).toBe(true);
      
      const operations = (memFs.fs as any).operations;
      
      // Verify bin directory was created
      expect(operations).toContainEqual({
        operation: 'ensureDir',
        args: ['/app/generated/binaries/multi-binary-tool/bin']
      });
      
      // Verify docs directory was created  
      expect(operations).toContainEqual({
        operation: 'ensureDir',
        args: ['/app/generated/binaries/multi-binary-tool/docs']
      });
      
      // Verify executables were copied to bin directory
      expect(operations.some((op: any) => 
        op.operation === 'copyFile' && 
        op.args[1].includes('/bin/tool')
      )).toBe(true);
      
      // Verify documentation files were copied
      expect(operations.some((op: any) => 
        op.operation === 'copyFile' && 
        op.args[1].includes('/docs/')
      )).toBe(true);

      expect(result.otherChanges).toContain('Organized tool into bin directory');
      expect(result.otherChanges).toContain('Organized documentation files');
    });

    it('should handle build/compile hook that processes source code', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'source-tool',
        binaries: ['source-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/source-tool',
          hooks: {
            afterExtract: (async (context: EnhancedInstallHookContext) => {
              if (!context.extractDir) {
                throw new Error('No extraction directory available');
              }
              
              // Check if this is a source distribution
              const makefilePath = path.join(context.extractDir, 'Makefile');
              const hasMakefile = await context.fileSystem.exists(makefilePath);
              
              if (hasMakefile) {
                context.logger.info('Source distribution detected, compiling...');
                
                // In a real scenario, this would run: make PREFIX=${context.installDir} install
                // For this test, we'll simulate the process
                
                // Create the binary in the install directory
                const binaryPath = path.join(context.installDir, context.toolName);
                await context.fileSystem.writeFile(binaryPath, '#!/bin/bash\\necho \"Compiled binary\"');
                await context.fileSystem.chmod(binaryPath, 0o755);
                
                // Create additional compiled artifacts
                const libDir = path.join(context.installDir, 'lib');
                await context.fileSystem.ensureDir(libDir);
                
                const libPath = path.join(libDir, 'libsource-tool.so');
                await context.fileSystem.writeFile(libPath, 'compiled library content');
                
                context.otherChanges.push('Compiled source code successfully');
                context.otherChanges.push('Created shared library');
                
                context.logger.info('Compilation completed successfully');
              } else {
                context.logger.info('Pre-compiled binary distribution detected');
              }
            }) as any,
          },
        },
      };

      // Mock filesystem to return true for Makefile existence
      memFs.spies.exists = mock((path: string) => 
        Promise.resolve(path.includes('Makefile'))
      );

      const result = await installer.install('source-tool', toolConfig);

      expect(result.success).toBe(true);
      
      const operations = (memFs.fs as any).operations;
      
      // Verify Makefile check was performed (via exists mock)
      expect(memFs.spies.exists).toHaveBeenCalledWith(expect.stringContaining('Makefile'));
      
      // Verify compiled binary was created
      expect(operations.some((op: any) => 
        op.operation === 'writeFile' && 
        op.args[0].endsWith('/source-tool')
      )).toBe(true);
      
      // Verify library directory was created
      expect(operations).toContainEqual({
        operation: 'ensureDir',
        args: ['/app/generated/binaries/source-tool/lib']
      });

      expect(result.otherChanges).toContain('Compiled source code successfully');
      expect(result.otherChanges).toContain('Created shared library');
    });

    it('should handle hook failure gracefully with detailed error information', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'failing-tool',
        binaries: ['failing-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/failing-tool',
          hooks: {
            afterDownload: (async (context: EnhancedInstallHookContext) => {
              context.logger.error('Validation failed');
              throw new Error('Downloaded file validation failed: checksum mismatch');
            }) as any,
          },
        },
      };

      const result = await installer.install('failing-tool', toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('afterDownload hook failed');
      expect(result.error).toContain('Downloaded file validation failed: checksum mismatch');
      
      // Verify that the hook failure was logged appropriately
      logger.expect(
        ['ERROR'],
        ['HookExecutor'],
        ['Installation failed [afterDownload hook] for tool "failing-tool": Downloaded file validation failed: checksum mismatch']
      );
    });

    it('should provide hooks with proper logging context', async () => {
      let capturedLogger: any;

      const toolConfig: GithubReleaseToolConfig = {
        name: 'logging-test-tool',
        binaries: ['logging-test-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/logging-test-tool',
          hooks: {
            afterInstall: (async (context: EnhancedInstallHookContext) => {
              capturedLogger = context.logger;
              context.logger.info('Hook execution message');
              context.logger.debug('Debug information');
              context.logger.error('Error message from hook');
            }) as any,
          },
        },
      };

      const result = await installer.install('logging-test-tool', toolConfig);

      expect(result.success).toBe(true);
      expect(capturedLogger).toBeDefined();
      
      // Verify that hook logging is properly namespaced
      logger.expect(
        ['INFO'],
        ['Hook-logging-test-tool'],
        ['Hook execution message']
      );
      
      logger.expect(
        ['DEBUG'],
        ['Hook-logging-test-tool'],
        ['Debug information']
      );
      
      logger.expect(
        ['ERROR'],
        ['Hook-logging-test-tool'],
        ['Error message from hook']
      );
    });
  });
});