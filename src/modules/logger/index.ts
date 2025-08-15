export * from './createTsLogger';
export * from './SafeLogMessage';
export * from './zodErrorFormatter';

import { architecture } from './templates/architecture';
import { cache } from './templates/cache';
import { command } from './templates/command';
import { config } from './templates/config';
import { downloader } from './templates/downloader';
import { extractor } from './templates/extractor';
import { fs } from './templates/fs';
import { general } from './templates/general';
import { generator } from './templates/generator';
import { githubClient } from './templates/githubClient';
import { hookExecutor } from './templates/hookExecutor';
import { installer } from './templates/installer';
import { registry } from './templates/registry';
import { service } from './templates/service';
import { shellInit } from './templates/shellInit';
import { shim } from './templates/shim';
import { symlink } from './templates/symlink';
import { tool } from './templates/tool';
import { versionChecker } from './templates/versionChecker';

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
