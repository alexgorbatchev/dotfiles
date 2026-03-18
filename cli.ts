#!/usr/bin/env bun

import { runCliEntrypoint } from './packages/cli/src/cli';

if (import.meta.main) {
  runCliEntrypoint(process.argv).catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
