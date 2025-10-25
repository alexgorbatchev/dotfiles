#!/usr/bin/env bun

import { main } from './packages/cli/src/main';

if (import.meta.main) {
  main(process.argv).catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
