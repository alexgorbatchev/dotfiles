import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { vol } from 'memfs';
import type fsType from 'node:fs'; // For casting vol
import path from 'node:path';
import { extractArchive } from '../archive';
// zx module is mocked below

// Mock the zx module and its $ command
const mockZx$ = mock(async (cmdParts: TemplateStringsArray, ...args: any[]) => {
  // Default success mock
  return { exitCode: 0, stdout: '', stderr: '' };
});
mock.module('zx', () => ({
  $: mockZx$,
  quiet: true,
}));

describe('extractArchive', () => {
  // No mockFs variable needed, will use vol directly
  const destinationDir = '/test/extracted';

  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(destinationDir, { recursive: true });
    mockZx$.mockClear();
  });

  it('should call fs.promises.mkdir to ensure destination directory exists', async () => {
    const archivePath = '/test/dummy.zip';
    vol.writeFileSync(archivePath, 'dummy zip content');

    // Spy on vol.promises.mkdir directly for this test
    const mockMkdir = mock(vol.promises.mkdir.bind(vol.promises));
    const originalMkdir = vol.promises.mkdir;
    vol.promises.mkdir = mockMkdir;

    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);
    expect(mockMkdir).toHaveBeenCalledWith(destinationDir, { recursive: true });

    // Restore original method
    vol.promises.mkdir = originalMkdir;
  });

  it('should correctly call "unzip" for .zip files', async () => {
    const archivePath = '/test/archive.zip';
    vol.writeFileSync(archivePath, 'zip');

    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);

    expect(mockZx$).toHaveBeenCalledTimes(1);
    const call = mockZx$.mock.calls[0]!; // Non-null assertion
    expect(call[0].join('')).toContain('unzip -o');
    expect(call[1]).toBe(archivePath);
    expect(call[2]).toBe(destinationDir);
  });

  it('should correctly call "tar" for .tar.gz files', async () => {
    const archivePath = '/test/archive.tar.gz';
    vol.writeFileSync(archivePath, 'tar.gz');

    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);

    expect(mockZx$).toHaveBeenCalledTimes(1);
    const call = mockZx$.mock.calls[0]!; // Non-null assertion
    expect(call[0].join('')).toContain('tar -xzf');
    expect(call[1]).toBe(archivePath);
    expect(call[2]).toBe(destinationDir);
  });

  it('should correctly call "tar" for .tgz files', async () => {
    const archivePath = '/test/archive.tgz';
    vol.writeFileSync(archivePath, 'tgz');

    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);
    expect(mockZx$).toHaveBeenCalledTimes(1);
    const call = mockZx$.mock.calls[0]!; // Non-null assertion
    expect(call[0].join('')).toContain('tar -xzf');
    expect(call[1]).toBe(archivePath);
    expect(call[2]).toBe(destinationDir);
  });

  it('should correctly call "gunzip" for .gz files', async () => {
    const archivePath = '/test/file.txt.gz';
    const expectedOutputPath = path.join(destinationDir, 'file.txt');
    vol.writeFileSync(archivePath, 'gz');

    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);

    expect(mockZx$).toHaveBeenCalledTimes(1);
    const call = mockZx$.mock.calls[0]!; // Non-null assertion
    expect(call[0].join('')).toContain('gunzip -c');
    expect(call[1]).toBe(archivePath);
    expect(call[2]).toBe(expectedOutputPath);
  });

  it('should throw an error for unsupported archive formats', async () => {
    const archivePath = '/test/archive.rar';
    vol.writeFileSync(archivePath, 'rar');

    await expect(
      extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType)
    ).rejects.toThrow(`Unsupported archive format: ${archivePath}`);
    expect(mockZx$).not.toHaveBeenCalled();
  });

  it('should throw an error if zx command fails', async () => {
    const archivePath = '/test/fail.zip';
    vol.writeFileSync(archivePath, 'zip');
    const failureMessage = 'unzip failed badly';
    const exitCode = 12;

    mockZx$.mockImplementationOnce(async () => {
      throw { exitCode, stderr: failureMessage, stdout: '' };
    });

    await expect(
      extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType)
    ).rejects.toThrow(
      `Failed to extract archive ${archivePath} using system tools. Exit code: ${exitCode}. Error: ${failureMessage}`
    );
  });

  it('should attempt to set zx.quiet (conceptual test)', async () => {
    const archivePath = '/test/quiet.zip';
    vol.writeFileSync(archivePath, 'zip');
    // Test ensures the line `$.quiet = !logger.enabled;` in SUT is covered
    // and doesn't error with the mocked zx module.
    await extractArchive(archivePath, destinationDir, vol as unknown as typeof fsType);
    expect(mockZx$).toHaveBeenCalled(); // Confirms extraction was attempted
  });
});
