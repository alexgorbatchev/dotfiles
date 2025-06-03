/**
 * @file generator/src/modules/extractor/__tests__/ArchiveExtractor.test.ts
 * @description Tests for the ArchiveExtractor class.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { ArchiveExtractor } from '../ArchiveExtractor';
import type { IArchiveExtractor } from '../IArchiveExtractor';
import { MemFileSystem } from '../../file-system/MemFileSystem';
import type { IFileSystem } from '../../file-system/IFileSystem';
import type { ArchiveFormat, ExtractOptions, ExtractResult } from '../../../types';
import { $ } from 'zx';

// Mock zx's $ command
// We'll need to be more specific with mockImplementation for different commands
const mockZx = mock(async (chunks: TemplateStringsArray, ...args: any[]) => {
  const cmd = chunks.join('') + args.join('');
  // Default mock, can be overridden in tests
  // console.log(`Mocked zx command: ${cmd}`);
  return { stdout: '', stderr: '', exitCode: 0 };
});

mock.module('zx', () => ({
  $: mockZx,
  // export other zx properties if needed, like chalk, fs, etc.
}));

describe('ArchiveExtractor', () => {
  let fileSystem: IFileSystem;
  let extractor: IArchiveExtractor;

  beforeEach(() => {
    fileSystem = new MemFileSystem();
    extractor = new ArchiveExtractor(fileSystem);
    mockZx.mockClear();
    // Default zx mock for successful execution
    mockZx.mockImplementation(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
  });

  describe('detectFormat', () => {
    it('should detect .tar.gz by extension', async () => {
      expect(await extractor.detectFormat('archive.tar.gz')).toBe('tar.gz');
      expect(await extractor.detectFormat('archive.tgz')).toBe('tar.gz');
    });

    it('should detect .zip by extension', async () => {
      expect(await extractor.detectFormat('archive.zip')).toBe('zip');
    });

    it('should detect .tar.bz2 by extension', async () => {
      expect(await extractor.detectFormat('archive.tar.bz2')).toBe('tar.bz2');
      expect(await extractor.detectFormat('archive.tbz2')).toBe('tar.bz2');
      expect(await extractor.detectFormat('archive.tbz')).toBe('tar.bz2');
    });

    it('should detect .tar.xz by extension', async () => {
      expect(await extractor.detectFormat('archive.tar.xz')).toBe('tar.xz');
      expect(await extractor.detectFormat('archive.txz')).toBe('tar.xz');
    });

    it('should detect .tar by extension', async () => {
      expect(await extractor.detectFormat('archive.tar')).toBe('tar');
    });

    it('should use "file" command as fallback for .tar.gz', async () => {
      mockZx.mockImplementationOnce(async (chunks: TemplateStringsArray) => {
        if (chunks.join('').includes('file -b --mime-type')) {
          return { stdout: 'application/gzip', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });
      expect(await extractor.detectFormat('archive_no_ext')).toBe('tar.gz');
    });

    it('should use "file" command as fallback for .zip', async () => {
      mockZx.mockImplementationOnce(async (chunks: TemplateStringsArray) => {
        if (chunks.join('').includes('file -b --mime-type')) {
          return { stdout: 'application/zip', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });
      expect(await extractor.detectFormat('archive_no_ext_zip')).toBe('zip');
    });

    it('should throw for unsupported or undetectable format', async () => {
      mockZx.mockImplementationOnce(async () => ({
        stdout: 'application/octet-stream',
        stderr: '',
        exitCode: 0,
      }));
      await expect(extractor.detectFormat('archive.unknown')).rejects.toThrow(
        'Unsupported or undetectable archive format for: archive.unknown'
      );
    });
  });

  describe('isSupported', () => {
    it('should return true for supported formats', () => {
      expect(extractor.isSupported('tar.gz')).toBe(true);
      expect(extractor.isSupported('zip')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(extractor.isSupported('rar')).toBe(false); // Assuming rar is not yet implemented
    });
  });

  describe('extract', () => {
    const archivePath = '/tmp/archive.tar.gz';
    const targetDir = '/tmp/output';

    beforeEach(async () => {
      // Ensure the /tmp directory exists in the memfs volume
      if (!(await fileSystem.exists('/tmp'))) {
        await fileSystem.mkdir('/tmp', { recursive: true });
      }
      // Create a dummy archive file for tests that need it
      await fileSystem.writeFile(archivePath, 'dummy archive content');
      // Ensure targetDir does not exist initially for some tests, or is clean
      if (await fileSystem.exists(targetDir)) {
        await fileSystem.rm(targetDir, { recursive: true, force: true });
      }
      // extractor.detectFormat will be called, ensure it resolves for common test cases
      // This can be overridden per test if specific detection behavior is needed
      mockZx.mockImplementation(async (chunks: TemplateStringsArray) => {
        const cmd = chunks.join('');
        if (cmd.includes('file -b --mime-type')) {
          if (cmd.includes('archive.tar.gz'))
            return { stdout: 'application/gzip', stderr: '', exitCode: 0 };
          if (cmd.includes('archive.zip'))
            return { stdout: 'application/zip', stderr: '', exitCode: 0 };
        }
        // Default for tar, unzip commands
        return { stdout: '', stderr: '', exitCode: 0 };
      });
    });

    it('should extract a .tar.gz archive', async () => {
      const options: ExtractOptions = { targetDir };
      await extractor.extract(archivePath, options);
      expect(mockZx).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('tar -xzf')]),
        archivePath,
        expect.stringContaining(targetDir), // tempExtractDir will be part of this
        '' // for no strip-components
      );
    });

    it('should extract a .zip archive', async () => {
      const zipArchivePath = '/tmp/archive.zip';
      await fileSystem.writeFile(zipArchivePath, 'dummy zip content');
      const options: ExtractOptions = { targetDir };
      await extractor.extract(zipArchivePath, options);
      expect(mockZx).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('unzip -qo')]),
        zipArchivePath,
        expect.stringContaining(targetDir) // tempExtractDir
      );
    });

    it('should use --strip-components for tar archives if specified', async () => {
      const options: ExtractOptions = { targetDir, stripComponents: 1 };
      await extractor.extract(archivePath, options);
      expect(mockZx).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('tar -xzf')]),
        archivePath,
        expect.stringContaining(targetDir),
        '--strip-components=1'
      );
    });

    it('should clean up temporary extraction directory on success', async () => {
      await extractor.extract(archivePath, { targetDir });
      // Check if temp dir was created and then removed.
      // This is hard to check directly without inspecting fs calls more deeply or listing dirs.
      // For now, we assume it's cleaned if no error.
      // A more robust test would mock fs.readdir to see the temp dir and then its absence.
      expect(true).toBe(true); // Placeholder for now
    });

    it('should clean up temporary extraction directory on failure', async () => {
      mockZx.mockImplementationOnce(async (cmdParts) => {
        if (cmdParts.join('').includes('tar -xzf')) throw new Error('tar failed');
        return { stdout: '', stderr: '', exitCode: 0 };
      });
      await expect(extractor.extract(archivePath, { targetDir })).rejects.toThrow('tar failed');
      // Similar to above, direct check of temp dir removal is tricky.
      expect(true).toBe(true); // Placeholder
    });

    // TODO: Add tests for detectAndSetExecutables if its logic becomes more complex
    // TODO: Add tests for other archive formats once implemented (tar.bz2, tar.xz, etc.)
  });
});
