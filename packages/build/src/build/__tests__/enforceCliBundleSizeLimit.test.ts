import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { BuildError } from '../handleBuildError';
import { enforceCliBundleSizeLimit } from '../steps/enforceCliBundleSizeLimit';
import type { IBuildContext } from '../types';
import {
  FIXTURE_LARGE_FILE_SIZE_BYTES,
  FIXTURE_MAX_SIZE_LIMIT_BYTES,
  FIXTURE_SMALL_FILE_SIZE_BYTES,
} from './fixtures/fixtures--bundle-size';
import { createMockBuildContext } from './helpers/createMockBuildContext';
import { setupTmpDir } from './helpers/manageTmpDir';

const tmpHelper = setupTmpDir(__dirname);

describe('enforceCliBundleSizeLimit', () => {
  let mockContext: IBuildContext;
  let tempFile: string;

  beforeEach(() => {
    tmpHelper.ensureDir();
    // Create a temporary test file
    tempFile = path.join(tmpHelper.TMP_DIR, `test-cli-${Date.now()}.js`);
    mockContext = createMockBuildContext({
      paths: {
        cliOutputFile: tempFile,
      },
      constants: {
        maxCliBundleSizeKb: FIXTURE_MAX_SIZE_LIMIT_BYTES / 1024,
        maxCliBundleSizeBytes: FIXTURE_MAX_SIZE_LIMIT_BYTES,
      },
    });
  });

  afterEach(() => {
    tmpHelper.cleanup(tempFile);
  });

  test('passes when CLI file is under size limit', () => {
    // Create a file under the limit
    fs.writeFileSync(tempFile, 'x'.repeat(FIXTURE_SMALL_FILE_SIZE_BYTES));

    expect(() => {
      enforceCliBundleSizeLimit(mockContext);
    }).not.toThrow();
  });

  test('throws error when CLI file exceeds size limit', () => {
    // Create a file over the limit
    fs.writeFileSync(tempFile, 'x'.repeat(FIXTURE_LARGE_FILE_SIZE_BYTES));

    expect(() => {
      enforceCliBundleSizeLimit(mockContext);
    }).toThrow(BuildError);
  });

  test('throws error message includes file size in KB', () => {
    // Create a file over the limit
    fs.writeFileSync(tempFile, 'x'.repeat(FIXTURE_LARGE_FILE_SIZE_BYTES));

    try {
      enforceCliBundleSizeLimit(mockContext);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      const errorMessage = String(error);
      expect(errorMessage).toContain('too large');
      expect(errorMessage).toContain('kb');
    }
  });

  test('passes when file is exactly at the size limit', () => {
    // Create a file exactly at the limit
    fs.writeFileSync(tempFile, 'x'.repeat(FIXTURE_MAX_SIZE_LIMIT_BYTES));

    expect(() => {
      enforceCliBundleSizeLimit(mockContext);
    }).not.toThrow();
  });

  test('throws error when CLI file does not exist', () => {
    mockContext.paths.cliOutputFile = '/nonexistent/path/cli.js';

    expect(() => {
      enforceCliBundleSizeLimit(mockContext);
    }).toThrow();
  });

  test('throws error with helpful message about external dependencies', () => {
    // Create a file over the limit
    fs.writeFileSync(tempFile, 'x'.repeat(FIXTURE_LARGE_FILE_SIZE_BYTES));

    try {
      enforceCliBundleSizeLimit(mockContext);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      const errorMessage = String(error);
      expect(errorMessage).toContain('external dependencies');
    }
  });
});
