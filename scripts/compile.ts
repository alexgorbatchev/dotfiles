#!/usr/bin/env bun

import path from 'node:path';
import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

const outFile = path.resolve(process.cwd(), 'dist/dotfiles-generator');

await $`mkdir -p ${path.dirname(outFile)}`;

// Generate types first
// await $`./scripts/build-types.sh`;

// Then compile the binary
await $`bun build ./cli.ts --compile --minify --define 'CLI_BIN_PATH="'${outFile}'"' --outfile ${outFile}`;

console.log(`✅ Generated ${outFile}`);
