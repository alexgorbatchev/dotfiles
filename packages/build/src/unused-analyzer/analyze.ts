#!/usr/bin/env bun

import path from 'node:path';
import { analyzeProject } from './analyze-project/analyzeProject';
import { formatResults } from './formatResults';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: bun find-unused <path-to-tsconfig.json> [file-path-to-check]');
    process.exit(1);
  }

  const tsConfigPath = path.resolve(args[0] ?? '');
  const targetFilePath = args[1] ? path.resolve(args[1]) : undefined;

  console.log(`🔍 Analyzing TypeScript project: ${tsConfigPath}`);
  if (targetFilePath) {
    console.log(`📄 Checking only: ${targetFilePath}`);
  }
  console.log('');

  const results = analyzeProject(
    tsConfigPath,
    (current, total, filePath) => {
      const percentage = Math.min(100, Math.floor((current / total) * 100));
      const barLength = 40;
      const filledLength = Math.min(barLength, Math.max(0, Math.floor((current / total) * barLength)));
      const emptyLength = Math.max(0, barLength - filledLength);
      const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
      const fileName = path.basename(filePath);
      process.stdout.write(`\r\x1b[K📊 Progress: [${bar}] ${percentage}% (${current}/${total}) ${fileName}`);
    },
    targetFilePath
  );

  // Clear the progress bar line
  process.stdout.write('\r\x1b[K');

  const output = formatResults(results);

  console.log(output);
}

main();
