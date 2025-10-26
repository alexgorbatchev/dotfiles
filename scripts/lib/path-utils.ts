import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function getDirname(metaUrl: string): string {
  const __filename = fileURLToPath(metaUrl);
  return path.dirname(__filename);
}

export function cdToRepoRoot(metaUrl: string): void {
  const __dirname = getDirname(metaUrl);
  process.chdir(path.join(__dirname, '..'));
}

export function printDirectoryContents(directoryPath: string, title: string = 'Directory contents'): void {
  console.log(`📋 ${title}:`);

  if (!fs.existsSync(directoryPath)) {
    console.log('   (Directory does not exist)');
    return;
  }

  const files = fs.readdirSync(directoryPath, { withFileTypes: true });

  if (files.length === 0) {
    console.log('   (Empty directory)');
    return;
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of files) {
    const icon = file.isDirectory() ? '📁' : '📄';
    console.log(`   ${icon} ${file.name}`);
  }
}
