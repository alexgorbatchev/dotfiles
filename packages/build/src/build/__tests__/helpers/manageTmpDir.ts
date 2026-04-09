import fs from "node:fs";
import path from "node:path";

interface ITmpDirHelper {
  TMP_DIR: string;
  ensureDir: () => void;
  cleanup: (filePath: string) => void;
}

export function setupTmpDir(testDirPath: string): ITmpDirHelper {
  const TMP_DIR = path.join(testDirPath, ".tmp");

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
