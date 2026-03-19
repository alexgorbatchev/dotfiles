import {
  Architecture,
  hasArchitecture,
  hasPlatform,
  type ISystemInfo,
  Platform,
  privateProjectConfigFields,
  type ProjectConfig,
  type ProjectConfigPartial,
  projectConfigSchema,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { expandHomePath } from '@dotfiles/utils';
import path from 'node:path';
import { z } from 'zod';
import { messages } from './log-messages';

type EnvMap = Record<string, string | undefined>;

type RecordUnknown = Record<string, unknown>;

type StringMap = Record<string, string>;

export interface ICreateProjectConfigFromObjectOptions {
  userConfigPath: string;
}

function isRecord(value: unknown): value is RecordUnknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): RecordUnknown {
  if (isRecord(value)) {
    return value;
  }

  const result: RecordUnknown = {};
  return result;
}

function deepMerge(target: RecordUnknown, source: RecordUnknown): RecordUnknown {
  const output: RecordUnknown = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue: unknown = source[key];
    if (sourceValue === undefined) {
      continue;
    }

    const targetValue: unknown = target[key];

    if (isRecord(sourceValue) && isRecord(targetValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
      continue;
    }

    output[key] = sourceValue;
  }

  return output;
}

function detectOS(platform: Platform): string {
  switch (platform) {
    case Platform.MacOS:
      return 'macos';
    case Platform.Linux:
      return 'linux';
    case Platform.Windows:
      return 'windows';
    default:
      return 'unknown';
  }
}

function detectArch(arch: Architecture): string {
  switch (arch) {
    case Architecture.X86_64:
      return 'x86_64';
    case Architecture.Arm64:
      return 'arm64';
    default:
      return 'unknown';
  }
}

function applyPlatformOverrides(parentLogger: TsLogger, config: RecordUnknown, systemInfo: ISystemInfo): RecordUnknown {
  const logger = parentLogger.getSubLogger({ name: 'applyPlatformOverrides' });
  const platformOverridesValue: unknown = config['platform'];

  if (!Array.isArray(platformOverridesValue)) {
    const result: RecordUnknown = { ...config };
    delete result['platform'];
    return result;
  }

  const currentPlatform: string = detectOS(systemInfo.platform);
  const currentArch: string = detectArch(systemInfo.arch);

  logger.debug(messages.platformOverrides(currentPlatform, currentArch));

  const currentPlatformEnum: Platform = (
    {
      macos: Platform.MacOS,
      linux: Platform.Linux,
      windows: Platform.Windows,
    } satisfies Record<string, Platform>
  )[currentPlatform] ?? Platform.None;

  const currentArchEnum: Architecture = (
    {
      x86_64: Architecture.X86_64,
      arm64: Architecture.Arm64,
    } satisfies Record<string, Architecture>
  )[currentArch] ?? Architecture.None;

  let result: RecordUnknown = deepMerge({}, config);

  for (const overrideValue of platformOverridesValue) {
    if (!isRecord(overrideValue)) {
      continue;
    }

    const matchValue: unknown = overrideValue['match'];
    const overrideConfigValue: unknown = overrideValue['config'];

    if (!Array.isArray(matchValue) || !isRecord(overrideConfigValue)) {
      continue;
    }

    const matches: boolean = matchValue.some((match) => {
      if (!isRecord(match)) {
        return false;
      }

      const matchOs: unknown = match['os'];
      const matchArch: unknown = match['arch'];

      const targetPlatform: Platform = typeof matchOs === 'string'
        ? ((
          {
            macos: Platform.MacOS,
            linux: Platform.Linux,
            windows: Platform.Windows,
          } satisfies Record<string, Platform>
        )[matchOs] ?? Platform.None)
        : Platform.None;

      const targetArch: Architecture = typeof matchArch === 'string'
        ? ((
          {
            x86_64: Architecture.X86_64,
            arm64: Architecture.Arm64,
          } satisfies Record<string, Architecture>
        )[matchArch] ?? Architecture.None)
        : Architecture.None;

      const osMatches: boolean = typeof matchOs !== 'string' || hasPlatform(targetPlatform, currentPlatformEnum);
      const archMatches: boolean = typeof matchArch !== 'string' || hasArchitecture(targetArch, currentArchEnum);

      return osMatches && archMatches;
    });

    if (matches) {
      result = deepMerge(result, overrideConfigValue);
    }
  }

  delete result['platform'];
  return result;
}

function resolveNestedConfigValue(varName: string, fullConfig: RecordUnknown): string | undefined {
  const parts: string[] = varName.split('.');
  let value: unknown = fullConfig;

  for (const part of parts) {
    if (!isRecord(value)) {
      return undefined;
    }

    if (!(part in value)) {
      return undefined;
    }

    value = value[part];
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function replaceTokensOnce(configStr: string, env: EnvMap, fullConfig: RecordUnknown): string {
  const tokenRegex: RegExp = /(?<!\$)\{([a-zA-Z0-9_.]+)\}/g;

  const result: string = configStr.replace(tokenRegex, (match: string, varName: string) => {
    if (varName.includes('.')) {
      const nestedValue = resolveNestedConfigValue(varName, fullConfig);
      return nestedValue ?? match;
    }

    const envValue: string | undefined = env[varName];
    return envValue ?? match;
  });

  return result;
}

function extractUnresolvedTokens(value: string): string[] {
  const tokenRegex: RegExp = /(?<!\$)\{([a-zA-Z0-9_.]+)\}/g;
  const result: string[] = [];

  for (const match of value.matchAll(tokenRegex)) {
    const tokenName: string | undefined = match[1];
    if (typeof tokenName !== 'string') {
      continue;
    }

    result.push(`{${tokenName}}`);
  }

  const uniqueTokens: string[] = [...new Set(result)].sort((a: string, b: string) => a.localeCompare(b));
  return uniqueTokens;
}

function performFixedPointStringSubstitution(configStr: string, env: EnvMap, fullConfig: RecordUnknown): string {
  const maxIterations: number = 20;

  let current: string = configStr;
  const seenStates: Set<string> = new Set([current]);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const next: string = replaceTokensOnce(current, env, fullConfig);
    if (next === current) {
      return current;
    }

    if (seenStates.has(next)) {
      const unresolvedTokens: string[] = extractUnresolvedTokens(next);
      const unresolvedSection: string = unresolvedTokens.length > 0
        ? ` Possible cyclic/unresolved tokens: ${unresolvedTokens.join(', ')}.`
        : '';
      throw new Error(`String token substitution did not converge due to a cycle.${unresolvedSection}`);
    }

    seenStates.add(next);
    current = next;
  }

  const unresolvedTokens: string[] = extractUnresolvedTokens(current);
  const unresolvedSection: string = unresolvedTokens.length > 0
    ? ` Remaining tokens after ${maxIterations} iterations: ${unresolvedTokens.join(', ')}.`
    : '';
  throw new Error(`String token substitution did not converge after ${maxIterations} iterations.${unresolvedSection}`);
}

function substituteTokensInValue(value: unknown, env: EnvMap, fullConfig: RecordUnknown): unknown {
  if (typeof value === 'string') {
    const result: string = performFixedPointStringSubstitution(value, env, fullConfig);
    return result;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = value.map((item) => substituteTokensInValue(item, env, fullConfig));
    return result;
  }

  if (isRecord(value)) {
    const result: RecordUnknown = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = substituteTokensInValue(child, env, fullConfig);
    }
    return result;
  }

  return value;
}

function performFixedPointObjectSubstitution(config: RecordUnknown, env: EnvMap): RecordUnknown {
  const maxIterations: number = 20;

  let current: RecordUnknown = config;
  let previousSerialized: string = '';

  for (let i = 0; i < maxIterations; i++) {
    const currentSerialized: string = JSON.stringify(current);
    if (currentSerialized === previousSerialized) {
      break;
    }

    previousSerialized = currentSerialized;

    const substituted: unknown = substituteTokensInValue(current, env, current);
    const substitutedRecord: RecordUnknown = toRecord(substituted);
    current = substitutedRecord;
  }

  return current;
}

function expandTildeInPathsSubtree(config: RecordUnknown, configuredHomeDir: string): RecordUnknown {
  const pathsValue: unknown = config['paths'];
  const pathsRecord: RecordUnknown = toRecord(pathsValue);

  const expandedPaths: RecordUnknown = {};
  for (const [key, value] of Object.entries(pathsRecord)) {
    if (typeof value === 'string') {
      expandedPaths[key] = expandHomePath(configuredHomeDir, value);
      continue;
    }

    expandedPaths[key] = value;
  }

  const result: RecordUnknown = { ...config, paths: expandedPaths };
  return result;
}

function assertNoTildeInPaths(config: RecordUnknown): void {
  const pathsValue: unknown = config['paths'];
  const pathsRecord: RecordUnknown = toRecord(pathsValue);

  for (const value of Object.values(pathsRecord)) {
    if (typeof value !== 'string') {
      continue;
    }

    if (value.startsWith('~')) {
      throw new Error('Configuration contains unsupported tilde path in paths.*');
    }
  }
}

function resolveConfiguredHomeDir(config: RecordUnknown, bootstrapEnv: EnvMap, bootstrapHomeDir: string): string {
  const pathsValue: unknown = config['paths'];
  const pathsRecord: RecordUnknown = toRecord(pathsValue);

  const rawHomeDirValue: unknown = pathsRecord['homeDir'];
  const rawHomeDir: string = typeof rawHomeDirValue === 'string' ? rawHomeDirValue : '{HOME}';

  const substitutedHomeDir: string = performFixedPointStringSubstitution(rawHomeDir, bootstrapEnv, config);
  const expandedHomeDir: string = expandHomePath(bootstrapHomeDir, substitutedHomeDir);

  return expandedHomeDir;
}

function createStringEnv(env: EnvMap, extra: StringMap): EnvMap {
  const result: EnvMap = { ...env };

  for (const [key, value] of Object.entries(extra)) {
    result[key] = value;
  }

  return result;
}

function processConfig(
  parentLogger: TsLogger,
  userConfigPath: string,
  defaultConfig: RecordUnknown,
  userConfig: RecordUnknown,
  systemInfo: ISystemInfo,
  env: EnvMap,
): ProjectConfig {
  const logger = parentLogger.getSubLogger({ name: 'processConfig' });
  logger.debug(messages.configurationProcessing(), userConfigPath);

  const mergedConfig: RecordUnknown = deepMerge(defaultConfig, userConfig);
  const configWithPlatformOverrides: RecordUnknown = applyPlatformOverrides(parentLogger, mergedConfig, systemInfo);

  const configFileDir: string = path.dirname(userConfigPath);

  const injectedConfig: RecordUnknown = {
    ...configWithPlatformOverrides,
    configFilePath: userConfigPath,
    configFileDir,
  };

  const bootstrapEnv: EnvMap = createStringEnv(env, { HOME: systemInfo.homeDir, configFileDir });

  const configuredHomeDir: string = resolveConfiguredHomeDir(injectedConfig, bootstrapEnv, systemInfo.homeDir);

  const injectedPaths: RecordUnknown = { ...toRecord(injectedConfig['paths']), homeDir: configuredHomeDir };
  const configWithResolvedHome: RecordUnknown = { ...injectedConfig, paths: injectedPaths };

  const finalEnv: EnvMap = createStringEnv(env, { HOME: configuredHomeDir, configFileDir });

  const tokenSubstituted: RecordUnknown = performFixedPointObjectSubstitution(configWithResolvedHome, finalEnv);
  const tildeExpanded: RecordUnknown = expandTildeInPathsSubtree(tokenSubstituted, configuredHomeDir);

  assertNoTildeInPaths(tildeExpanded);

  const result = projectConfigSchema.extend(privateProjectConfigFields.shape).safeParse(tildeExpanded);

  if (!result.success) {
    const pretty: string = z.prettifyError(result.error);
    logger.error(messages.configurationValidationFailed([pretty]));
    throw new Error(`Project configuration is invalid.\n${pretty}`);
  }

  return result.data;
}

export async function loadDefaultProjectConfigAsRecord(fileSystem: IFileSystem): Promise<RecordUnknown> {
  // kept for API parity; fileSystem currently unused
  void fileSystem;

  const result: RecordUnknown = projectConfigSchema.parse({});
  return result;
}

export async function getDefaultConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  systemInfo: ISystemInfo,
  env: EnvMap,
  userConfigPath: string,
): Promise<ProjectConfig> {
  const defaultConfig: RecordUnknown = await loadDefaultProjectConfigAsRecord(fileSystem);
  const result: ProjectConfig = processConfig(
    parentLogger,
    userConfigPath,
    defaultConfig,
    {},
    systemInfo,
    env,
  );
  return result;
}

export async function createProjectConfigFromObject(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfig: ProjectConfigPartial = {},
  systemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
    hostname: 'test-host',
  },
  env: EnvMap = {},
  options: ICreateProjectConfigFromObjectOptions,
): Promise<ProjectConfig> {
  const resolvedUserConfigPath: string = options.userConfigPath;
  const defaultConfig: RecordUnknown = await loadDefaultProjectConfigAsRecord(fileSystem);

  const userConfigRecord: RecordUnknown = toRecord(userConfig);
  const result: ProjectConfig = processConfig(
    parentLogger,
    resolvedUserConfigPath,
    defaultConfig,
    userConfigRecord,
    systemInfo,
    env,
  );
  return result;
}
