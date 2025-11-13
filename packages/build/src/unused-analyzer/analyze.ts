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
    (filePath) => {
      process.stdout.write(`\r\x1b[K📄 Processing: ${filePath}`);
    },
    targetFilePath
  );

  process.stdout.write('\r\x1b[K');

  const output = formatResults(results);

  console.log(output);
}

main();
