#!/usr/bin/env bun

import { main } from '@dotfiles/cli';

if (import.meta.main) {
  main(process.argv).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
