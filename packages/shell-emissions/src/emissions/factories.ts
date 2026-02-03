import { EmissionValidationError } from '../errors';
import type {
  AliasEmission,
  CompletionConfig,
  CompletionEmission,
  Emission,
  EnvironmentEmission,
  FunctionEmission,
  PathEmission,
  PathOptions,
  ScriptEmission,
  ScriptTiming,
  SourceEmission,
  SourceFileEmission,
  SourceFunctionEmission,
} from '../types';
import {
  validateAliases,
  validateEnvironmentVariables,
  validateName,
  validateNonEmpty,
} from './validation';

/**
 * Creates an environment emission.
 */
export function environment(variables: Record<string, string>): EnvironmentEmission {
  validateEnvironmentVariables(variables);
  return {
    kind: 'environment',
    variables,
  };
}

/**
 * Creates an alias emission.
 */
export function alias(aliases: Record<string, string>): AliasEmission {
  validateAliases(aliases);
  return {
    kind: 'alias',
    aliases,
  };
}

/**
 * Creates a function emission.
 * @param name - Function name
 * @param body - Raw function body (without declaration wrapper)
 */
export function fn(
  name: string,
  body: string,
): FunctionEmission {
  validateName('function', 'name', name);
  validateNonEmpty('function', 'body', body);
  return {
    kind: 'function',
    name,
    body,
  };
}

/**
 * Creates a script emission.
 * @param content - Script content
 * @param timing - Execution timing ('always' | 'once' | 'raw')
 */
export function script(
  content: string,
  timing: ScriptTiming,
): ScriptEmission {
  validateNonEmpty('script', 'content', content);
  return {
    kind: 'script',
    content,
    timing,
  };
}

/**
 * Creates a source file emission.
 * @param filePath - Path to source (may contain $HOME)
 */
export function sourceFile(
  filePath: string,
): SourceFileEmission {
  validateNonEmpty('sourceFile', 'path', filePath);
  return {
    kind: 'sourceFile',
    path: filePath,
  };
}

/**
 * Creates a source emission for inline content.
 * The content will be wrapped in a temporary function, sourced, and the function cleaned up.
 *
 * Generates:
 *   functionName() { <content> }
 *   source <(functionName)
 *   unset -f functionName
 *
 * @param content - Content to source (typically shell code that outputs shell code)
 * @param functionName - Unique function name for this source emission
 */
export function source(
  content: string,
  functionName: string,
): SourceEmission {
  validateNonEmpty('source', 'content', content);
  validateName('source', 'functionName', functionName);
  return {
    kind: 'source',
    content,
    functionName,
  };
}

/**
 * Creates a source function emission.
 * @param functionName - Name of function to source
 */
export function sourceFunction(functionName: string): SourceFunctionEmission {
  validateName('sourceFunction', 'functionName', functionName);
  return {
    kind: 'sourceFunction',
    functionName,
  };
}

/**
 * Creates a completion emission.
 */
export function completion(config: CompletionConfig): CompletionEmission {
  const hasDirectories = config.directories && config.directories.length > 0;
  const hasFiles = config.files && config.files.length > 0;
  const hasCommands = config.commands && config.commands.length > 0;

  if (!hasDirectories && !hasFiles && !hasCommands) {
    throw new EmissionValidationError(
      'completion',
      'config',
      'at least one of directories, files, or commands must be provided',
    );
  }

  return {
    kind: 'completion',
    directories: config.directories,
    files: config.files,
    commands: config.commands,
  };
}

/**
 * Creates a path emission.
 * @param directory - Directory to add (may contain $HOME)
 * @param options - Position and deduplication options
 */
export function path(directory: string, options?: PathOptions): PathEmission {
  validateNonEmpty('path', 'directory', directory);
  return {
    kind: 'path',
    directory,
    position: options?.position ?? 'prepend',
    deduplicate: options?.deduplicate ?? true,
  };
}

/**
 * Returns a new emission with source attribution set.
 * @param emission - The emission to copy
 * @param source - Attribution identifier (e.g., config file path)
 * @returns A new emission with source set
 */
export function withSource<T extends Emission>(emission: T, source: string): T {
  return { ...emission, source };
}

/**
 * Returns a new emission with priority set.
 * @param emission - The emission to copy
 * @param priority - Sort order within block (lower = earlier)
 * @returns A new emission with priority set
 */
export function withPriority<T extends Emission>(emission: T, priority: number): T {
  return { ...emission, priority };
}
