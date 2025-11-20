import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import * as nodePath from 'node:path';
import { type IFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { $ } from 'bun';
import { ArchiveExtractor } from '../ArchiveExtractor';
import type { IArchiveExtractor } from '../IArchiveExtractor';

describe('ArchiveExtractor (with NodeFS)', () => {
  let nodeFsInstance: IFileSystem;
  let extractor: IArchiveExtractor;
  let testDirs: ITestDirectories;
  let nodeFs: IFileSystem;
  let logger: TestLogger;

  beforeAll(async () => {
    nodeFs = new NodeFileSystem();
    testDirs = await createTestDirectories(new TestLogger(), nodeFs, { testName: 'archive-extractor-real-fs' });
  });

  beforeEach(async () => {
    logger = new TestLogger();
    nodeFsInstance = new NodeFileSystem();
    extractor = new ArchiveExtractor(logger, nodeFsInstance);
  });

  describe('detectFormat', () => {
    it('should detect .tar.gz by extension', async () => {
      expect(await extractor.detectFormat('archive.tar.gz')).toBe('tar.gz');
      expect(await extractor.detectFormat('archive.tgz')).toBe('tar.gz');
    });

    it('should detect .zip by extension', async () => {
      expect(await extractor.detectFormat('archive.zip')).toBe('zip');
    });

    it('should use "file" command as fallback for .tar.gz', async () => {
      // Create a real gzipped file for testing
      const filePathWithoutExtension = nodePath.join(testDirs.paths.homeDir, 'mysterious_archive_is_tar_gz');
      await nodeFs.writeFile(`${filePathWithoutExtension}.tar.gz`, 'dummy tar.gz content');
      await $`gzip -f ${filePathWithoutExtension}.tar.gz`.quiet();
      // Rename to remove extension
      await $`mv ${filePathWithoutExtension}.tar.gz.gz ${filePathWithoutExtension}`.quiet();
      expect(await extractor.detectFormat(filePathWithoutExtension)).toBe('tar.gz');
    });

    it('should throw for unsupported or undetectable format after "file" fallback', async () => {
      const dummyFilePath = nodePath.join(testDirs.paths.homeDir, 'archive.unknown');
      await nodeFs.writeFile(dummyFilePath, 'dummy data'); // file command needs a real file

      expect(extractor.detectFormat(dummyFilePath)).rejects.toThrow(
        `Unsupported or undetectable archive format for: ${dummyFilePath}`
      );
    });
  });

  describe('isSupported', () => {
    it('should return true for supported formats', () => {
      expect(extractor.isSupported('tar.gz')).toBe(true);
      expect(extractor.isSupported('zip')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(extractor.isSupported('rar')).toBe(false);
    });
  });

  describe('extract', () => {
    // Helper to create a simple tar.gz file for testing using REAL tar
    const createTestTarGzUtil = async (
      archiveName: string,
      fileNameInArchive: string,
      fileContent: string,
      subDir?: string
    ) => {
      const sourceDir = nodePath.join(testDirs.paths.homeDir, 'source-tar');
      const fileToArchivePath = subDir ? nodePath.join(subDir, fileNameInArchive) : fileNameInArchive;
      const fullPathToFileInSource = nodePath.join(sourceDir, fileToArchivePath);
      const archiveFullPath = nodePath.join(testDirs.paths.homeDir, archiveName);

      await nodeFs.mkdir(nodePath.dirname(fullPathToFileInSource), { recursive: true });
      await nodeFs.writeFile(fullPathToFileInSource, fileContent);
      // Use actual child_process.exec (via Bun $ for convenience in test setup)
      await $`tar -czf ${archiveFullPath} -C ${sourceDir} ${fileToArchivePath}`.quiet();
      return archiveFullPath;
    };

    // Helper to create a simple zip file for testing using REAL zip
    const createTestZipUtil = async (
      archiveName: string,
      fileNameInArchive: string,
      fileContent: string,
      subDir?: string
    ) => {
      const sourceDir = nodePath.join(testDirs.paths.homeDir, 'source-zip');
      const fileToArchivePath = subDir ? nodePath.join(subDir, fileNameInArchive) : fileNameInArchive;
      const fullPathToFileInSource = nodePath.join(sourceDir, fileToArchivePath);
      const archiveFullPath = nodePath.join(testDirs.paths.homeDir, archiveName);

      await nodeFs.mkdir(nodePath.dirname(fullPathToFileInSource), { recursive: true });
      await nodeFs.writeFile(fullPathToFileInSource, fileContent);
      if (subDir) {
        await $`cd ${sourceDir} && zip -r ${archiveFullPath} ${subDir}`.quiet();
      } else {
        await $`zip -j ${archiveFullPath} ${fullPathToFileInSource}`.quiet();
      }
      return archiveFullPath;
    };

    it('should extract a .tar.gz archive using real tar', async () => {
      const archiveName = 'test-archive.tar.gz';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from tar.gz!';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, fileContent);

      const outputDir = nodePath.join(testDirs.paths.homeDir, 'output-tar');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir });

      const extractedFilePath = nodePath.join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should extract a .zip archive using real unzip', async () => {
      const archiveName = 'test-archive.zip';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from zip!';
      const realArchivePath = await createTestZipUtil(archiveName, fileName, fileContent);
      const outputDir = nodePath.join(testDirs.paths.homeDir, 'output-zip');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir, format: 'zip' });

      const extractedFilePath = nodePath.join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should clean up temporary extraction directory on success (real FS)', async () => {
      const archiveName = 'cleanup-success.tar.gz';
      const fileName = 'cleanup.txt';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, 'cleanup');
      const outputDir = nodePath.join(testDirs.paths.homeDir, 'output_cleanup_success');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(realArchivePath, { targetDir: outputDir });

      const itemsInOutputDir = await nodeFs.readdir(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });

    it('should clean up temporary extraction directory on failure', async () => {
      // Create an invalid archive that will cause tar to fail
      const invalidArchivePath = nodePath.join(testDirs.paths.homeDir, 'invalid.tar.gz');
      await nodeFs.writeFile(invalidArchivePath, 'This is not a valid tar.gz file');
      const outputDir = nodePath.join(testDirs.paths.homeDir, 'output_cleanup_fail');
      await nodeFs.mkdir(outputDir);

      expect(extractor.extract(invalidArchivePath, { targetDir: outputDir })).rejects.toThrow();

      const itemsInOutputDir = await nodeFs.readdir(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });
  });
});
