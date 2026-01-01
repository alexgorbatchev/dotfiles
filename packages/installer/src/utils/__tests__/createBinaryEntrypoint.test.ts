import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createAllBinaryEntrypoints, createBinaryEntrypoint } from '../createBinaryEntrypoint';

describe('createBinaryEntrypoint', () => {
  it('creates a symlink entrypoint pointing to the original binary location', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const binariesDir = '/app/binaries';
    const toolName = 'test-tool';
    const binaryName = 'test-binary';
    const timestamp = '2024-08-13-16-45-23';
    const binaryPath = 'extracted/test-binary';

    const actualBinaryPath = path.join(binariesDir, toolName, timestamp, binaryPath);
    await fs.mkdir(path.dirname(actualBinaryPath), { recursive: true });
    await fs.writeFile(actualBinaryPath, '#!/bin/bash\necho "test binary"');
    await fs.chmod(actualBinaryPath, 0o755);

    await createBinaryEntrypoint(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);

    const entrypointPath = path.join(binariesDir, toolName, timestamp, binaryName);

    // Entrypoint must exist
    expect(await fs.exists(entrypointPath)).toBe(true);

    // Entrypoint must be a symlink to preserve access to co-located supplementary files
    const entrypointStats = await fs.lstat(entrypointPath);
    expect(entrypointStats.isSymbolicLink()).toBe(true);

    // The symlink must point to the relative path of the binary
    const linkTarget = await fs.readlink(entrypointPath);
    expect(linkTarget).toBe('extracted/test-binary');

    // Reading through the symlink should return the actual binary contents
    const entrypointContents = await fs.readFile(entrypointPath, 'utf8');
    expect(entrypointContents).toBe('#!/bin/bash\necho "test binary"');
  });

  it('replaces an existing entrypoint file', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const binariesDir = '/app/binaries';
    const toolName = 'test-tool';
    const binaryName = 'test-binary';
    const timestamp = '2024-08-13-16-45-23';
    const binaryPath = 'extracted/test-binary';

    const actualBinaryPath = path.join(binariesDir, toolName, timestamp, binaryPath);
    await fs.mkdir(path.dirname(actualBinaryPath), { recursive: true });
    await fs.writeFile(actualBinaryPath, '#!/bin/bash\necho "v1"');
    await fs.chmod(actualBinaryPath, 0o755);

    await createBinaryEntrypoint(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);

    await fs.writeFile(actualBinaryPath, '#!/bin/bash\necho "v2"');
    await createBinaryEntrypoint(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);

    const entrypointPath = path.join(binariesDir, toolName, timestamp, binaryName);
    const entrypointContents = await fs.readFile(entrypointPath, 'utf8');
    expect(entrypointContents).toBe('#!/bin/bash\necho "v2"');
  });
});

describe('createAllBinaryEntrypoints', () => {
  it('creates symlink entrypoints for multiple binaries', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const binariesDir = '/app/binaries';
    const toolName = 'multi-tool';
    const binaries = ['tool1', 'tool2', 'tool3'];
    const timestamp = '2024-08-13-16-45-23';
    const binaryBasePath = 'extracted/bin';

    for (const binaryName of binaries) {
      const actualBinaryPath = path.join(binariesDir, toolName, timestamp, binaryBasePath, binaryName);
      await fs.mkdir(path.dirname(actualBinaryPath), { recursive: true });
      await fs.writeFile(actualBinaryPath, `#!/bin/bash\necho "${binaryName}"`);
      await fs.chmod(actualBinaryPath, 0o755);
    }

    await createAllBinaryEntrypoints(fs, toolName, binaries, timestamp, binaryBasePath, binariesDir, logger);

    for (const binaryName of binaries) {
      const entrypointPath = path.join(binariesDir, toolName, timestamp, binaryName);
      expect(await fs.exists(entrypointPath)).toBe(true);

      // Entrypoints must be symlinks
      const entrypointStats = await fs.lstat(entrypointPath);
      expect(entrypointStats.isSymbolicLink()).toBe(true);

      // Each symlink should point to the correct relative path
      const linkTarget = await fs.readlink(entrypointPath);
      expect(linkTarget).toBe(path.join(binaryBasePath, binaryName));

      const entrypointContents = await fs.readFile(entrypointPath, 'utf8');
      expect(entrypointContents).toBe(`#!/bin/bash\necho "${binaryName}"`);
    }
  });
});
