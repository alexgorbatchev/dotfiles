import { type IFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { $ } from 'dax-sh';
import { dirname, join } from 'node:path';
import { ArchiveExtractor } from '../ArchiveExtractor';
import type { IArchiveExtractor } from '../IArchiveExtractor';

describe('ArchiveExtractor (with NodeFS)', (): void => {
  let nodeFsInstance: IFileSystem;
  let extractor: IArchiveExtractor;
  let testDirs: ITestDirectories;
  let nodeFs: IFileSystem;
  let logger: TestLogger;

  beforeAll(async (): Promise<void> => {
    nodeFs = new NodeFileSystem();
    testDirs = await createTestDirectories(new TestLogger(), nodeFs, { testName: 'archive-extractor-real-fs' });
  });

  beforeEach(async (): Promise<void> => {
    logger = new TestLogger();
    nodeFsInstance = new NodeFileSystem();
    extractor = new ArchiveExtractor(logger, nodeFsInstance);
  });

  describe('detectFormat', (): void => {
    it('should detect .tar.gz by extension', async (): Promise<void> => {
      expect(await extractor.detectFormat('archive.tar.gz')).toBe('tar.gz');
      expect(await extractor.detectFormat('archive.tgz')).toBe('tar.gz');
    });

    it('should detect .zip by extension', async (): Promise<void> => {
      expect(await extractor.detectFormat('archive.zip')).toBe('zip');
    });

    it('should use "file" command as fallback for .tar.gz', async (): Promise<void> => {
      // Create a real gzipped file for testing
      const filePathWithoutExtension = join(testDirs.paths.homeDir, 'mysterious_archive_is_tar_gz');
      await nodeFs.writeFile(`${filePathWithoutExtension}.tar.gz`, 'dummy tar.gz content');
      await $`gzip -f ${filePathWithoutExtension}.tar.gz`.quiet();
      // Rename to remove extension
      await $`mv ${filePathWithoutExtension}.tar.gz.gz ${filePathWithoutExtension}`.quiet();
      expect(await extractor.detectFormat(filePathWithoutExtension)).toBe('tar.gz');
    });

    it('should throw for unsupported or undetectable format after "file" fallback', async (): Promise<void> => {
      const dummyFilePath = join(testDirs.paths.homeDir, 'archive.unknown');
      await nodeFs.writeFile(dummyFilePath, 'dummy data'); // file command needs a real file

      expect(extractor.detectFormat(dummyFilePath)).rejects.toThrow(
        `Unsupported or undetectable archive format for: ${dummyFilePath}`,
      );
    });
  });

  describe('isSupported', (): void => {
    it('should return true for supported formats', (): void => {
      expect(extractor.isSupported('tar.gz')).toBe(true);
      expect(extractor.isSupported('zip')).toBe(true);
    });

    it('should return false for unsupported formats', (): void => {
      expect(extractor.isSupported('rar')).toBe(false);
    });
  });

  describe('extract', (): void => {
    // Helper to create a simple tar.gz file for testing using REAL tar
    const createTestTarGzUtil = async (
      archiveName: string,
      filePathInArchive: string,
      fileContent: string,
    ): Promise<string> => {
      const sourceDir = join(testDirs.paths.homeDir, 'source-tar');
      const fullPathToFileInSource = join(sourceDir, filePathInArchive);
      const archiveFullPath = join(testDirs.paths.homeDir, archiveName);

      await nodeFs.mkdir(dirname(fullPathToFileInSource), { recursive: true });
      await nodeFs.writeFile(fullPathToFileInSource, fileContent);
      await $`tar -czf ${archiveFullPath} -C ${sourceDir} ${filePathInArchive}`.quiet();
      return archiveFullPath;
    };

    const createTestZipWithSingleFile = async (
      archiveName: string,
      fileNameInArchive: string,
      fileContent: string,
    ): Promise<string> => {
      const sourceDir = join(testDirs.paths.homeDir, 'source-zip-file');
      const fullPathToFileInSource = join(sourceDir, fileNameInArchive);
      const archiveFullPath = join(testDirs.paths.homeDir, archiveName);

      await nodeFs.mkdir(dirname(fullPathToFileInSource), { recursive: true });
      await nodeFs.writeFile(fullPathToFileInSource, fileContent);
      await $`zip -j ${archiveFullPath} ${fullPathToFileInSource}`.quiet();
      return archiveFullPath;
    };

    it('should extract a .tar.gz archive using real tar', async (): Promise<void> => {
      const archiveName = 'test-archive.tar.gz';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from tar.gz!';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, fileContent);

      const outputDir = join(testDirs.paths.homeDir, 'output-tar');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(logger, realArchivePath, { targetDir: outputDir });

      const extractedFilePath = join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);

      // Verify logger received calls
      logger.expect(['DEBUG'], ['ArchiveExtractor', 'extract'], [], []);
    });

    it('should extract a .tar.gz archive when the archive path contains a single quote', async (): Promise<void> => {
      const archiveName = "test-archive-with-quote'.tar.gz";
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from tar.gz with quote!';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, fileContent);

      const outputDir = join(testDirs.paths.homeDir, 'output-tar-quote');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(logger, realArchivePath, { targetDir: outputDir });

      const extractedFilePath = join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should extract a .zip archive using real unzip', async (): Promise<void> => {
      const archiveName = 'test-archive.zip';
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from zip!';
      const realArchivePath = await createTestZipWithSingleFile(archiveName, fileName, fileContent);
      const outputDir = join(testDirs.paths.homeDir, 'output-zip');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(logger, realArchivePath, { targetDir: outputDir, format: 'zip' });

      const extractedFilePath = join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should extract a .zip archive when the archive path contains a single quote', async (): Promise<void> => {
      const archiveName = "test-archive-with-quote'.zip";
      const fileName = 'testfile.txt';
      const fileContent = 'Hello from zip with quote!';
      const realArchivePath = await createTestZipWithSingleFile(archiveName, fileName, fileContent);
      const outputDir = join(testDirs.paths.homeDir, 'output-zip-quote');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(logger, realArchivePath, { targetDir: outputDir, format: 'zip' });

      const extractedFilePath = join(outputDir, fileName);
      expect(await nodeFs.exists(extractedFilePath)).toBe(true);
      expect(await nodeFs.readFile(extractedFilePath, 'utf-8')).toBe(fileContent);
    });

    it('should clean up temporary extraction directory on success (real FS)', async (): Promise<void> => {
      const archiveName = 'cleanup-success.tar.gz';
      const fileName = 'cleanup.txt';
      const realArchivePath = await createTestTarGzUtil(archiveName, fileName, 'cleanup');
      const outputDir = join(testDirs.paths.homeDir, 'output_cleanup_success');
      await nodeFs.mkdir(outputDir);

      await extractor.extract(logger, realArchivePath, { targetDir: outputDir });

      const itemsInOutputDir = await nodeFs.readdir(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });

    it('should clean up temporary extraction directory on failure', async (): Promise<void> => {
      // Create an invalid archive that will cause tar to fail
      const invalidArchivePath = join(testDirs.paths.homeDir, 'invalid.tar.gz');
      await nodeFs.writeFile(invalidArchivePath, 'This is not a valid tar.gz file');
      const outputDir = join(testDirs.paths.homeDir, 'output_cleanup_fail');
      await nodeFs.mkdir(outputDir);

      expect(extractor.extract(logger, invalidArchivePath, { targetDir: outputDir })).rejects.toThrow();

      const itemsInOutputDir = await nodeFs.readdir(outputDir);
      for (const item of itemsInOutputDir) {
        expect(item.startsWith('_extract_')).toBe(false);
      }
    });
  });
});
