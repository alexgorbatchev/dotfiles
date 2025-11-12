import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getDirname(metaUrl: string): string {
  const __filename = fileURLToPath(metaUrl);
  return path.dirname(__filename);
}

export function getRepoRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Walk up the directory tree until we find package.json with workspaces
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.workspaces) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error('Could not find repository root (no package.json with workspaces found)');
}

export function cdToRepoRoot(): void {
  const repoRoot = getRepoRoot();
  process.chdir(repoRoot);
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
