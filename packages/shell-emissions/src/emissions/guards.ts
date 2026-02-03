import type {
  AliasEmission,
  CompletionEmission,
  Emission,
  EnvironmentEmission,
  FunctionEmission,
  PathEmission,
  ScriptEmission,
  SourceFileEmission,
  SourceFunctionEmission,
} from '../types';

/**
 * Type guard for environment emission.
 */
export function isEnvironmentEmission(e: Emission): e is EnvironmentEmission {
  return e.kind === 'environment';
}

/**
 * Type guard for alias emission.
 */
export function isAliasEmission(e: Emission): e is AliasEmission {
  return e.kind === 'alias';
}

/**
 * Type guard for function emission.
 */
export function isFunctionEmission(e: Emission): e is FunctionEmission {
  return e.kind === 'function';
}

/**
 * Type guard for script emission.
 */
export function isScriptEmission(e: Emission): e is ScriptEmission {
  return e.kind === 'script';
}

/**
 * Type guard for source file emission.
 */
export function isSourceFileEmission(e: Emission): e is SourceFileEmission {
  return e.kind === 'sourceFile';
}

/**
 * Type guard for source function emission.
 */
export function isSourceFunctionEmission(e: Emission): e is SourceFunctionEmission {
  return e.kind === 'sourceFunction';
}

/**
 * Type guard for completion emission.
 */
export function isCompletionEmission(e: Emission): e is CompletionEmission {
  return e.kind === 'completion';
}

/**
 * Type guard for path emission.
 */
export function isPathEmission(e: Emission): e is PathEmission {
  return e.kind === 'path';
}

/** Emission kinds that are always hoisted to designated sections */
const HOISTED_KINDS = new Set(['environment', 'path', 'completion']);

/**
 * Determines if an emission should be hoisted to a designated section.
 * Hoisted kinds: environment, path, completion
 */
export function isHoisted(e: Emission): boolean {
  return HOISTED_KINDS.has(e.kind);
}

/**
 * Determines if an emission supports HOME override.
 */
export function needsHomeOverride(e: Emission): boolean {
  if (isFunctionEmission(e)) {
    return e.homeOverride;
  }
  if (isScriptEmission(e)) {
    return e.timing !== 'raw' && e.homeOverride === true;
  }
  if (isSourceFileEmission(e)) {
    return e.homeOverride;
  }
  return false;
}
