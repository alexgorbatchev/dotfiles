#!/usr/bin/env bun

import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);
process.chdir('.generated/bin');

await $`./fzf @update`;
