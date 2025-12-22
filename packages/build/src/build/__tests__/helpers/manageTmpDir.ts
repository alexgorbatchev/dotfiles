import fs from 'node:fs';
import path from 'node:path';

interface TmpDirHelper {
  TMP_DIR: string;
  ensureDir: () => void;
  cleanup: (filePath: string) => void;
}

/**
 * Setup helper for managing temporary test directory
 * Provides utilities to create and cleanup test files in a local .tmp folder
 */
export function setupTmpDir(testDirPath: string): TmpDirHelper {
  const TMP_DIR = path.join(testDirPath, '.tmp');

  const ensureDir = (): void => {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  };

  const cleanup = (filePath: string): void => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    TMP_DIR,
    ensureDir,
    cleanup,
  };
}
