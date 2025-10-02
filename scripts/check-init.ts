#!/usr/bin/env bun

import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

await $`./scripts/compile.ts`;

const testDir = '.generated/check-init-test';
await $`rm -rf ${testDir}`;
await $`mkdir -p ${testDir}`;

process.chdir(testDir);

await $`../dist/dotfiles-generator init`;
