import { describe, it, expect, mock, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { exec as actualExecCallbackSignature } from 'node:child_process'; // Renamed for clarity
import { promisify } from 'node:util'; // Import promisify
import { ArchiveExtractor } from '../ArchiveExtractor';
import type { IArchiveExtractor } from '../IArchiveExtractor';
import { NodeFileSystem } from '@modules/file-system/NodeFileSystem';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { $ } from 'zx'; // For creating test archives
import { createTestDirectories, type TestDirectories } from '@testing-helpers';

// This is the real exec, promisified, for use INSIDE our mock's implementation when needed
const realPromisedExecViaUtil = promisify(actualExecCallbackSignature);

// mockExecCallback must always adhere to the node-style callback signature,
// because ArchiveExtractor does `promisify(execCallback)` where execCallback is this mock.
const mockExecCallback = mock((command: string, optionsOrCallback: any, callback?: any) => {
  const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
  // Default behavior: successful mock, for tests NOT needing real execution
  // console.log(`Default mockExecCallback for command: ${command}`);
  cb(null, { stdout: `Mocked stdout for ${command}`, stderr: 'Mocked stderr' });
});

mock.module('node:child_process', () => {
  return {
    exec: mockExecCallback, // ArchiveExtractor will get this via its import
  };
});

describe('ArchiveExtractor (with NodeFS)', () => {
  let nodeFsInstance: IFileSystem;
  let extractor: IArchiveExtractor;
  let testDirs: TestDirectories;
  let testTempRoot: string;

  beforeAll(() => {
    // Create a single root for all tests in this suite
    testTempRoot = createTestDirectories({
      testName: 'archive-extractor-real-fs',
    }).tempDir;
  });

  afterAll(() => {
    // Cleanup the single root directory
    if (nodeFs.existsSync(testTempRoot)) {
      nodeFs.rmSync(testTempRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    mock.restore();

    // Create a fresh subdirectory for each test
    const testName = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    testDirs = createTestDirectories({
      testName: nodePath.join(testTempRoot, testName),
    });

    nodeFsInstance = new NodeFileSystem();
    extractor = new ArchiveExtractor(nodeFsInstance);

    // Default mock implementation for exec (simulates success)
    mockExecCallback.mockImplementation(
      (command: string, optionsOrCallback: any, callback?: any) => {
        const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        cb(null, { stdout: `stdout for ${command}`, stderr: '' });
      }
    );
  });

  afterEach(() => {
    // No per-test cleanup needed as afterAll handles the root
  });

  // --- detectFormat Tests ---
  describe('detectFormat', () => {
    it('should detect .tar.gz by extension', async () => {
      expect(await extractor.detectFormat('archive.tar.gz')).toBe('tar.gz');
      expect(await extractor.detectFormat('archive.tgz')).toBe('tar.gz');
    });

    it('should detect .zip by extension', async () => {
      expect(await extractor.detectFormat('archive.zip')).toBe('zip');
    });

    it('should use "file" command as fallback for .tar.gz', async () => {
      mockExecCallback.mockImplementationOnce((command, opts, cb) => {
        if (typeof opts === 'function') cb = opts;
        if (command.includes('file -b --mime-type')) {
          cb(null, { stdout: 'application/gzip', stderr: '' });
        } else {
          cb(new Error('Unexpected command for file mock'));
        }
      });
      const filePathWithoutExtension = nodePath.join(
        testDirs.tempDir,
        'mysterious_archive_is_tar_gz'
      );
      // Create a dummy file for the 'file' command to operate on
      nodeFs.writeFileSync(filePathWithoutExtension, 'dummy tar.gz content');
      expect(await extractor.detectFormat(filePathWithoutExtension)).toBe('tar.gz');
      expect(mockExecCallback).toHaveBeenCalledWith(
        expect.stringContaining('file -b --mime-type'),
        expect.any(Function)
      );
    });

    it('should throw for unsupported or undetectable format after "file" fallback', async () => {
      mockExecCallback.mockImplementationOnce((_command, opts, cb) => {
        // Prefixed command with _
        if (typeof opts === 'function') cb = opts;
        cb(null, { stdout: 'application/octet-stream', stderr: '' });
      });
      const dummyFilePath = nodePath.join(testDirs.tempDir, 'archive.unknown');
      nodeFs.writeFileSync(dummyFilePath, 'dummy data'); // file command needs a real file
      expect(extractor.detectFormat(dummyFilePath)).rejects.toThrow(
        `Unsupported or undetectable archive format for: ${dummyFilePath}`
      );
    });
  });

  // --- isSupported Tests ---
  describe('isSupported', () => {
    it('should return true for supported formats', () => {
      expect(extractor.isSupported('tar.gz')).toBe(true);
      expect(extractor.isSupported('zip')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(extractor.isSupported('rar')).toBe(false);
    });
  });

  // --- extract Tests (using real external commands) ---
  describe('extract', () => {
    // Helper to create a simple tar.gz file for testing using REAL tar
    const createTestTarGzUtil = async (
      archiveName: string,
      fileNameInArchive: string,
      fileContent: string,
      subDir?: string
    ) => {
      const sourceDir = nodePath.join(testDirs.tempDir, 'source-tar');
      const fileToArchivePath = subDir
        ? nodePath.join(subDir, fileNameInArchive)
        : fileNameInArchive;
      const fullPathToFileInSource = nodePath.join(sourceDir, fileToArchivePath);
      const archiveFullPath = nodePath.join(testDirs.tempDir, archiveName);

      nodeFs.mkdirSync(nodePath.dirname(fullPathToFileInSource), { recursive: true });
      nodeFs.writeFileSync(fullPathToFileInSource, fileContent);

      // Use actual child_process.exec (via zxDollarReal for convenience in test setup)
      await $`tar -czf ${archiveFullPath} -C ${sourceDir} ${fileToArchivePath}`;
      return archiveFullPath;
    };

    // Helper to create a simple zip file for testing using REAL zip
    const createTestZipUtil = async (
      archiveName: string,
      fileNameInArchive: string,
      fileContent: string,
      subDir?: string
    ) => {
      const sourceDir = nodePath.join(testDirs.tempDir, 'source-zip');
      const fileToArchivePath = subDir
        ? nodePath.join(subDir, fileNameInArchive)
        : fileNameInArchive;
      const fullPathToFileInSource = nodePath.join(sourceDir, fileToArchivePath);
      const archiveFullPath = nodePath.join(testDirs.tempDir, archiveName);

      nodeFs.mkdirSync(nodePath.dirname(fullPathToFileInSource), { recursive: true });
      nodeFs.writeFileSync(fullPathToFileInSource, fileContent);

      if (subDir) {
        await $`cd ${sourceDir} && zip -r ${archiveFullPath} ${subDir}`;
      } else {
        await $`zip -j ${archiveFullPath} ${fullPathToFileInSource}`;
      }
      return archiveFullPath;
    };

    it('should extract a .tar.gz archive using real tar', async () => {
      // For this test, make mockExecCallback use the real promisified exec internally
      // and translate its promise result back to a callback for the outer promisify.
      mockExecCallback.mockImplementation(
        (command: string, optionsOrCallback: any, callback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          // console.log(`Real-exec mock implementation for command: ${command}`);
          realPromisedExecViaUtil(command)
            .then(({ stdout, stderr }) => {
              // console.log(`Real-exec success for ${command}: stdout=${stdout}`);
              cb(null, { stdout, stderr });
            })
            .catch((error) => {
              // console.error(`Real-exec error for ${command}:`, error);
              const err = new Error(error.message || 'Error in realPromisedExecViaUtil');
              (err as any).stdout = error.stdout;
              (err as any).stderr = error.stderr;
              (err as any).code = error.code || error.exitCode;
              cb(err, { stdout: error.stdout || '', stderr: error.stderr || '' });
            });
        }
      );

      const archiveName = 'test-archive.tar.gz';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from tar.gz!';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, fileContent);

      const outputDir = nodePath.join(testDirs.tempDir, 'output-tar');
      nodeFs.mkdirSync(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir });

      const extractedFilePath = nodePath.join(outputDir, fileName);
      expect(nodeFs.existsSync(extractedFilePath)).toBe(true);
      expect(nodeFs.readFileSync(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should use --strip-components for tar archives if specified using real tar', async () => {
      mockExecCallback.mockImplementation(
        (command: string, optionsOrCallback: any, callback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          realPromisedExecViaUtil(command)
            .then(({ stdout, stderr }) => cb(null, { stdout, stderr }))
            .catch((error) => {
              const err = new Error(error.message || 'Error in realPromisedExecViaUtil');
              (err as any).stdout = error.stdout;
              (err as any).stderr = error.stderr;
              (err as any).code = error.code || error.exitCode;
              cb(err, { stdout: error.stdout || '', stderr: error.stderr || '' });
            });
        }
      );

      const archiveName = 'test-strip.tar.gz';
      const fileName = 'testfile.txt';
      const fileContent = 'Strip me!';
      const subDir = 'dir1/dir2';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, fileContent, subDir);
      const outputDir = nodePath.join(testDirs.tempDir, 'output-strip');
      nodeFs.mkdirSync(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir, stripComponents: 2 });

      const extractedFilePath = nodePath.join(outputDir, fileName);
      expect(nodeFs.existsSync(extractedFilePath)).toBe(true);
      expect(nodeFs.readFileSync(extractedFilePath, 'utf-8')).toBe(fileContent);
      expect(nodeFs.existsSync(nodePath.join(outputDir, 'dir1'))).toBe(false);
    });

    it('should extract a .zip archive using real unzip', async () => {
      mockExecCallback.mockImplementation(
        (command: string, optionsOrCallback: any, callback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          realPromisedExecViaUtil(command)
            .then(({ stdout, stderr }) => cb(null, { stdout, stderr }))
            .catch((error) => {
              const err = new Error(error.message || 'Error in realPromisedExecViaUtil');
              (err as any).stdout = error.stdout;
              (err as any).stderr = error.stderr;
              (err as any).code = error.code || error.exitCode;
              cb(err, { stdout: error.stdout || '', stderr: error.stderr || '' });
            });
        }
      );

      const archiveName = 'test-archive.zip';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from zip!';
      const realArchivePath = await createTestZipUtil(archiveName, fileName, fileContent);
      const outputDir = nodePath.join(testDirs.tempDir, 'output-zip');
      nodeFs.mkdirSync(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir, format: 'zip' });

      const extractedFilePath = nodePath.join(outputDir, fileName);
      expect(nodeFs.existsSync(extractedFilePath)).toBe(true);
      expect(nodeFs.readFileSync(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should clean up temporary extraction directory on success (real FS)', async () => {
      mockExecCallback.mockImplementation(
        (command: string, optionsOrCallback: any, callback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          realPromisedExecViaUtil(command)
            .then(({ stdout, stderr }) => cb(null, { stdout, stderr }))
            .catch((error) => {
              const err = new Error(error.message || 'Error in realPromisedExecViaUtil');
              (err as any).stdout = error.stdout;
              (err as any).stderr = error.stderr;
              (err as any).code = error.code || error.exitCode;
              cb(err, { stdout: error.stdout || '', stderr: error.stderr || '' });
            });
        }
      );
      const archiveName = 'cleanup-success.tar.gz';
      const fileName = 'cleanup.txt';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, 'cleanup');
      const outputDir = nodePath.join(testDirs.tempDir, 'output_cleanup_success');
      nodeFs.mkdirSync(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir });

      const itemsInOutputDir = nodeFs.readdirSync(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });

    it('should clean up temporary extraction directory on failure (mocked exec fail)', async () => {
      // This test WILL use the mocked exec to simulate failure
      mockExecCallback.mockImplementationOnce(
        (command: string, optionsOrCallback: any, callback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          if (command.includes('tar -xzf')) {
            cb(new Error('Mocked tar failure'), { stdout: '', stderr: 'Mocked tar stderr' });
          } else {
            cb(null, { stdout: '', stderr: '' });
          }
        }
      );

      const archiveName = 'cleanup-fail.tar.gz';
      const fileName = 'fail.txt';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, 'I will fail.');
      const outputDir = nodePath.join(testDirs.tempDir, 'output_cleanup_fail');
      nodeFs.mkdirSync(outputDir);

      expect(extractor.extract(realArchivePath, { targetDir: outputDir })).rejects.toThrow(
        'Mocked tar failure'
      );

      const itemsInOutputDir = nodeFs.readdirSync(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });
  });
});
