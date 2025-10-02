#!/usr/bin/env bun

import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

await $`scripts/compile.ts`;
await $`rm -fr ./.generated`;
await $`dist/dotfiles-generator ${process.argv.slice(2)}`;
