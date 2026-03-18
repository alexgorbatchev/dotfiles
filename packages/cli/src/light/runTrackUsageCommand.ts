import type { TsLogger } from '@dotfiles/logger';
import { createLightRuntimeContext } from './createLightRuntimeContext';

interface ITrackUsageArgs {
  toolName: string;
  binaryName: string;
  config: string;
  platform?: string;
  arch?: string;
}

function parseTrackUsageArgs(argv: string[]): ITrackUsageArgs | null {
  const commandIndex = argv.indexOf('@track-usage');
  if (commandIndex < 0) {
    return null;
  }

  const positionals: string[] = [];
  let config = '';
  let platform: string | undefined;
  let arch: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) {
      continue;
    }

    if (token === '@track-usage') {
      continue;
    }

    if (token === '--config' || token === '--platform' || token === '--arch') {
      const value = argv[i + 1];
      if (!value) {
        continue;
      }

      if (token === '--config') {
        config = value;
      }
      if (token === '--platform') {
        platform = value;
      }
      if (token === '--arch') {
        arch = value;
      }

      i += 1;
      continue;
    }

    if (i > commandIndex && !token.startsWith('-')) {
      positionals.push(token);
    }
  }

  const toolName = positionals[0];
  const binaryName = positionals[1];
  if (!toolName || !binaryName) {
    return null;
  }

  return {
    toolName,
    binaryName,
    config,
    platform,
    arch,
  };
}

export async function runTrackUsageCommand(argv: string[]): Promise<void> {
  const args = parseTrackUsageArgs(argv);
  if (!args) {
    return;
  }

  const logger: TsLogger = {
    getSubLogger: () => logger,
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    setPrefix: () => logger,
  } as unknown as TsLogger;

  const context = await createLightRuntimeContext(logger, {
    config: args.config,
    cwd: process.cwd(),
    env: process.env,
    platform: args.platform,
    arch: args.arch,
  });

  if (!context) {
    return;
  }

  try {
    await context.toolInstallationRegistry.recordToolUsage(args.toolName, args.binaryName);
  } finally {
    context.close();
  }
}
