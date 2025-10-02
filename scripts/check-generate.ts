#!/usr/bin/env bun

import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

interface ShellError extends Error {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

function isShellError(error: unknown): error is ShellError {
  return error instanceof Error && 'stdout' in error && 'stderr' in error && 'exitCode' in error;
}

await $`./scripts/check-cli.ts generate`;

process.chdir('.generated/bin');

try {
  const fzfOutput = await $`./fzf --version`.text();
  console.log(fzfOutput);
} catch (error) {
  console.error('Error: fzf failed to print version:');
  if (isShellError(error)) {
    console.error(error.stdout.toString());
  }
  process.exit(1);
}

try {
  const ezaOutput = await $`./eza --version`.text();
  console.log(ezaOutput);
} catch (error) {
  console.error('Error: eza failed to print version:');
  if (isShellError(error)) {
    console.error(error.stdout.toString());
  }
  process.exit(1);
}
