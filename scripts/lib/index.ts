import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getDirname(metaUrl: string): string {
  const __filename = fileURLToPath(metaUrl);
  return path.dirname(__filename);
}

export function cdToRepoRoot(metaUrl: string): void {
  const __dirname = getDirname(metaUrl);
  process.chdir(path.join(__dirname, '..'));
}
