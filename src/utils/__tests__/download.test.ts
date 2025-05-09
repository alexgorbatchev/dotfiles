import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import fetchMock from 'fetch-mock';
import { vol } from 'memfs';
import type fsType from 'node:fs'; // For casting vol
import path from 'node:path';
import { Readable } from 'node:stream';
import { downloadFile } from '../download';

describe('downloadFile', () => {
  // No mockFs variable needed, will use vol directly
  const fetchHandler = fetchMock.fetchHandler as typeof fetch;

  beforeEach(() => {
    fetchMock.mockGlobal();
    vol.reset(); // Reset memfs
  });

  afterEach(() => {
    fetchMock.hardReset(); // Use hardReset per github-api.test.ts pattern
  });

  it('should download a file successfully', async () => {
    const fileUrl = 'http://example.com/file.txt';
    const fileContent = 'This is the file content.';
    const destinationPath = '/test/downloads/file.txt';

    fetchMock.get(fileUrl, {
      status: 200,
      body: fileContent,
      headers: { 'Content-Type': 'text/plain' },
    });

    // Pass vol directly, casting to the expected type
    await downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler);

    expect(vol.existsSync(destinationPath)).toBe(true);
    const downloadedContent = await vol.promises.readFile(destinationPath, 'utf-8');
    expect(downloadedContent).toBe(fileContent);
    expect(vol.existsSync(path.dirname(destinationPath))).toBe(true);
  });

  it('should throw an error if fetch fails with a non-200 status', async () => {
    const fileUrl = 'http://example.com/notfound.txt';
    const destinationPath = '/test/downloads/notfound.txt';

    fetchMock.get(fileUrl, 404);

    await expect(
      downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler)
    ).rejects.toThrow(`Failed to download file from ${fileUrl}. Status: 404 Not Found`);
    expect(vol.existsSync(destinationPath)).toBe(false);
  });

  it('should throw an error if fetch encounters a network issue', async () => {
    const fileUrl = 'http://example.com/networkerror.txt';
    const destinationPath = '/test/downloads/networkerror.txt';

    fetchMock.get(fileUrl, { throws: new Error('Network connection failed') });

    await expect(
      downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler)
    ).rejects.toThrow(`Failed to initiate download from ${fileUrl}: Network connection failed`);
    expect(vol.existsSync(destinationPath)).toBe(false);
  });

  it('should throw an error if response body is null', async () => {
    const fileUrl = 'http://example.com/nobody.txt';
    const destinationPath = '/test/downloads/nobody.txt';

    fetchMock.get(fileUrl, { status: 200, body: null as any });

    await expect(
      downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler)
    ).rejects.toThrow(`Response body is null for ${fileUrl}. Cannot download.`);
  });

  it('should create the destination directory if it does not exist', async () => {
    const fileUrl = 'http://example.com/file.txt';
    const fileContent = 'content';
    const destinationDir = '/new/dir/for/downloads';
    const destinationPath = `${destinationDir}/file.txt`;

    fetchMock.get(fileUrl, { body: fileContent });

    expect(vol.existsSync(destinationDir)).toBe(false);
    // Pass vol directly
    await downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler);
    expect(vol.existsSync(destinationDir)).toBe(true);
    expect(vol.existsSync(destinationPath)).toBe(true);
  });

  it('should clean up partially downloaded file on write stream error', async () => {
    const fileUrl = 'http://example.com/errorfile.txt';
    const destinationPath = '/test/downloads/errorfile.txt';

    fetchMock.get(fileUrl, { body: 'some content' });

    // Spy on vol.promises.unlink directly
    const mockUnlink = mock(vol.promises.unlink.bind(vol.promises));
    // Temporarily replace vol.promises.unlink with the mock for this test
    const originalUnlink = vol.promises.unlink;
    vol.promises.unlink = mockUnlink;

    // Mock createWriteStream on vol to return an erroring stream
    const originalCreateWriteStream = vol.createWriteStream;
    vol.createWriteStream = mock(() => {
      const Writable = require('node:stream').Writable;
      const errorStream = new Writable();
      errorStream._write = (
        _chunk: any,
        _encoding: any,
        callback: (error?: Error | null) => void
      ) => {
        callback(new Error('Simulated write error'));
      };
      return errorStream;
    }) as any;

    await expect(
      downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler)
    ).rejects.toThrow(/Failed to write downloaded file/);

    expect(vol.createWriteStream as any).toHaveBeenCalledWith(destinationPath);
    expect(mockUnlink).toHaveBeenCalledWith(destinationPath);

    // Restore original methods
    vol.promises.unlink = originalUnlink;
    vol.createWriteStream = originalCreateWriteStream;
  });

  it('should not crash if cleanup unlink fails', async () => {
    const fileUrl = 'http://example.com/errorfile2.txt';
    const destinationPath = '/test/downloads/errorfile2.txt';

    fetchMock.get(fileUrl, { body: 'some content' });

    // Mock vol.promises.unlink to throw an error
    const mockUnlinkThatFails = mock(async () => {
      throw new Error('Failed to unlink during cleanup');
    });
    const originalUnlink = vol.promises.unlink;
    vol.promises.unlink = mockUnlinkThatFails;

    // Mock createWriteStream on vol to return an erroring stream
    const originalCreateWriteStream = vol.createWriteStream;
    vol.createWriteStream = mock(() => {
      const Writable = require('node:stream').Writable;
      const errorStream = new Writable();
      errorStream._write = (
        _chunk: any,
        _encoding: any,
        callback: (error?: Error | null) => void
      ) => {
        callback(new Error('Simulated write error'));
      };
      return errorStream;
    }) as any;

    await expect(
      downloadFile(fileUrl, destinationPath, vol as unknown as typeof fsType, fetchHandler)
    ).rejects.toThrow(/Failed to write downloaded file/);
    expect(mockUnlinkThatFails).toHaveBeenCalledWith(destinationPath);

    // Restore original methods
    vol.promises.unlink = originalUnlink;
    vol.createWriteStream = originalCreateWriteStream;
  });
});
