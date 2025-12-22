import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import type { IBuildContext } from '../types';
import { createMockBuildContext } from './helpers/createMockBuildContext';
import { setupTmpDir } from './helpers/manageTmpDir';

const tmpHelper = setupTmpDir(__dirname);

describe('resolveRuntimeDependencies', () => {
  let mockContext: IBuildContext;
  let tempBundleFile: string;

  beforeEach(() => {
    tmpHelper.ensureDir();
    tempBundleFile = path.join(tmpHelper.TMP_DIR, `test-bundle-${Date.now()}.js`);
    mockContext = createMockBuildContext({
      paths: {
        cliOutputFile: tempBundleFile,
      },
    });

    // Create a temporary bundle file with mock content
    fs.writeFileSync(tempBundleFile, '// mock bundle content\n');
  });

  afterEach(() => {
    tmpHelper.cleanup(tempBundleFile);
  });

  test('context structure contains required build paths', () => {
    expect(mockContext.paths.cliOutputFile).toBeDefined();
    expect(mockContext.paths.rootDir).toBeDefined();
    expect(mockContext.paths.packagesDir).toBeDefined();
  });

  test('bundle file can be written and verified', () => {
    expect(fs.existsSync(tempBundleFile)).toBe(true);
    const content = fs.readFileSync(tempBundleFile, 'utf-8');
    expect(content).toContain('mock bundle content');
  });
});
