import type {
  IAliasEmission,
  ICompletionEmission,
  Emission,
  IEnvironmentEmission,
  IFunctionEmission,
  IPathEmission,
  IScriptEmission,
  ISourceEmission,
  ISourceFileEmission,
  ISourceFunctionEmission,
} from "../types";

/**
 * Type guard for environment emission.
 */
export function isEnvironmentEmission(e: Emission): e is IEnvironmentEmission {
  return e.kind === "environment";
}

/**
 * Type guard for alias emission.
 */
export function isAliasEmission(e: Emission): e is IAliasEmission {
  return e.kind === "alias";
}

/**
 * Type guard for function emission.
 */
export function isFunctionEmission(e: Emission): e is IFunctionEmission {
  return e.kind === "function";
}

/**
 * Type guard for script emission.
 */
export function isScriptEmission(e: Emission): e is IScriptEmission {
  return e.kind === "script";
}

/**
 * Type guard for source file emission.
 */
export function isSourceFileEmission(e: Emission): e is ISourceFileEmission {
  return e.kind === "sourceFile";
}

/**
 * Type guard for source emission (inline content).
 */
export function isSourceEmission(e: Emission): e is ISourceEmission {
  return e.kind === "source";
}

/**
 * Type guard for source function emission.
 */
export function isSourceFunctionEmission(e: Emission): e is ISourceFunctionEmission {
  return e.kind === "sourceFunction";
}

/**
 * Type guard for completion emission.
 */
export function isCompletionEmission(e: Emission): e is ICompletionEmission {
  return e.kind === "completion";
}

/**
 * Type guard for path emission.
 */
export function isPathEmission(e: Emission): e is IPathEmission {
  return e.kind === "path";
}

/** Emission kinds that are always hoisted to designated sections */
const HOISTED_KINDS = new Set(["environment", "path", "completion"]);

/**
 * Determines if an emission should be hoisted to a designated section.
 * Hoisted kinds: environment, path, completion
 */
export function isHoisted(e: Emission): boolean {
  return HOISTED_KINDS.has(e.kind);
}
