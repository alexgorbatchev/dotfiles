import * as fs from 'node:fs';
import * as path from 'path';

export function createTempDir(name: string) {
  const tempDir = path.join(__dirname, 'tmp', name);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}
