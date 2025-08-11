export * from './createTsLogger';

import { fs } from './templates/fs';
import { tool } from './templates/tool';
import { config } from './templates/config';
import { service } from './templates/service';
import { command } from './templates/command';
import { cache } from './templates/cache';
import { downloader } from './templates/downloader';
import { extractor } from './templates/extractor';
import { generator } from './templates/generator';
import { registry } from './templates/registry';
import { shellInit } from './templates/shellInit';
import { githubClient } from './templates/githubClient';
import { versionChecker } from './templates/versionChecker';
import { hookExecutor } from './templates/hookExecutor';
import { installer } from './templates/installer';
import { architecture } from './templates/architecture';
import { general } from './templates/general';
import { symlink } from './templates/symlink';
import { shim } from './templates/shim';

export const logs = {
  fs,
  tool,
  config,
  service,
  command,
  cache,
  downloader,
  extractor,
  generator,
  registry,
  shellInit,
  githubClient,
  versionChecker,
  hookExecutor,
  installer,
  architecture,
  general,
  symlink,
  shim,
};
