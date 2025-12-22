import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createAllBinaryEntrypoints, createBinaryEntrypoint } from '../createBinaryEntrypoint';

describe('createBinaryEntrypoint', () => {
  it('creates a real entrypoint file for a binary', async () => {
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
    const legacyEntrypointPath = path.join(binariesDir, toolName, binaryName);

    expect(await fs.exists(entrypointPath)).toBe(true);

    const entrypointStats = await fs.lstat(entrypointPath);
    expect(entrypointStats.isSymbolicLink()).toBe(false);

    const entrypointContents = await fs.readFile(entrypointPath, 'utf8');
    expect(entrypointContents).toBe('#!/bin/bash\necho "test binary"');

    expect(await fs.exists(legacyEntrypointPath)).toBe(false);
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
  it('creates entrypoint files for multiple binaries', async () => {
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

      const entrypointStats = await fs.lstat(entrypointPath);
      expect(entrypointStats.isSymbolicLink()).toBe(false);

      const entrypointContents = await fs.readFile(entrypointPath, 'utf8');
      expect(entrypointContents).toBe(`#!/bin/bash\necho "${binaryName}"`);
    }
  });
});
