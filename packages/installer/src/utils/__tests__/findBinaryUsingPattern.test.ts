import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { findBinaryUsingPattern } from '../setupBinariesFromArchive';

describe('findBinaryUsingPattern', () => {
  it('finds binary when pattern matches and basename equals binaryName', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    // Create hermit binary with exact name
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(path.join(extractDir, 'hermit'), '#!/bin/bash\necho "hermit"');
    await fs.chmod(path.join(extractDir, 'hermit'), 0o755);

    const result = await findBinaryUsingPattern(fs, extractDir, 'hermit', 'hermit', logger);

    expect(result).toBe(path.join(extractDir, 'hermit'));
  });

  it('finds binary when pattern has wildcard and matches platform-specific filename', async () => {
    // This is the hermit case: binary is named hermit-darwin-arm64 but we want to create shim "hermit"
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    // Create platform-specific binary like hermit releases
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(path.join(extractDir, 'hermit-darwin-arm64'), '#!/bin/bash\necho "hermit"');
    await fs.chmod(path.join(extractDir, 'hermit-darwin-arm64'), 0o755);
    // Also keep the archive
    await fs.writeFile(path.join(extractDir, 'hermit-darwin-arm64.gz'), 'archive');

    const result = await findBinaryUsingPattern(fs, extractDir, 'hermit-*', 'hermit', logger);

    // Should find hermit-darwin-arm64 even though basename !== 'hermit'
    expect(result).toBe(path.join(extractDir, 'hermit-darwin-arm64'));
  });

  it('prefers exact basename match when pattern matches multiple executables', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    // Create multiple matching binaries
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(path.join(extractDir, 'tool'), '#!/bin/bash\necho "tool"');
    await fs.chmod(path.join(extractDir, 'tool'), 0o755);
    await fs.writeFile(path.join(extractDir, 'tool-darwin'), '#!/bin/bash\necho "tool-darwin"');
    await fs.chmod(path.join(extractDir, 'tool-darwin'), 0o755);

    const result = await findBinaryUsingPattern(fs, extractDir, 'tool*', 'tool', logger);

    // Should prefer exact match
    expect(result).toBe(path.join(extractDir, 'tool'));
  });

  it('skips non-executable files when finding binary', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    // Create non-executable archive and executable binary
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(path.join(extractDir, 'tool-darwin-arm64.gz'), 'archive content');
    await fs.writeFile(path.join(extractDir, 'tool-darwin-arm64'), '#!/bin/bash\necho "tool"');
    await fs.chmod(path.join(extractDir, 'tool-darwin-arm64'), 0o755);

    const result = await findBinaryUsingPattern(fs, extractDir, 'tool-*', 'tool', logger);

    // Should only find the executable, not the archive
    expect(result).toBe(path.join(extractDir, 'tool-darwin-arm64'));
  });

  it('returns null when no files match pattern', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(path.join(extractDir, 'other-tool'), '#!/bin/bash\necho "other"');
    await fs.chmod(path.join(extractDir, 'other-tool'), 0o755);

    const result = await findBinaryUsingPattern(fs, extractDir, 'hermit*', 'hermit', logger);

    expect(result).toBeNull();
  });

  it('returns null when pattern matches but no executables found', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    await fs.mkdir(extractDir, { recursive: true });
    // File matches pattern but is not executable
    await fs.writeFile(path.join(extractDir, 'hermit-darwin-arm64.gz'), 'archive');

    const result = await findBinaryUsingPattern(fs, extractDir, 'hermit-*', 'hermit', logger);

    expect(result).toBeNull();
  });

  it('finds binary in subdirectory with {,*/} pattern', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const extractDir = '/extract';

    // Create binary in subdirectory (common archive layout)
    await fs.mkdir(path.join(extractDir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(extractDir, 'bin', 'tool'), '#!/bin/bash\necho "tool"');
    await fs.chmod(path.join(extractDir, 'bin', 'tool'), 0o755);

    const result = await findBinaryUsingPattern(fs, extractDir, '{,*/}tool', 'tool', logger);

    expect(result).toBe(path.join(extractDir, 'bin', 'tool'));
  });
});
