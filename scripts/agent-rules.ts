#!/usr/bin/env bun

import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

await $`bun rulesync generate --targets copilot`;
