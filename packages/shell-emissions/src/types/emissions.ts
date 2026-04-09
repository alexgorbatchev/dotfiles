/**
 * Union type of all emission discriminators.
 */
export type EmissionKind =
  | "environment"
  | "alias"
  | "function"
  | "script"
  | "source"
  | "sourceFile"
  | "sourceFunction"
  | "completion"
  | "path";

/**
 * Script execution timing semantics.
 * - `always`: Runs every shell startup
 * - `once`: Generates separate file that self-deletes after execution
 * - `raw`: Direct emission exactly as provided (no modifications)
 */
export type ScriptTiming = "always" | "once" | "raw";

/**
 * Base properties shared by all emissions.
 */
export interface IBaseEmission {
  /** Type discriminator */
  readonly kind: EmissionKind;
  /** Optional attribution identifier (e.g., config file path) */
  source?: string;
  /** Sort order within block (lower = earlier, default: 0) */
  priority?: number;
}

/**
 * Sets environment variables.
 */
export interface IEnvironmentEmission extends IBaseEmission {
  readonly kind: "environment";
  /** Key-value pairs of environment variables */
  readonly variables: Record<string, string>;
}

/**
 * Defines command aliases.
 */
export interface IAliasEmission extends IBaseEmission {
  readonly kind: "alias";
  /** Name to command mapping */
  readonly aliases: Record<string, string>;
}

/**
 * Defines a callable function.
 */
export interface IFunctionEmission extends IBaseEmission {
  readonly kind: "function";
  /** Function name */
  readonly name: string;
  /** Raw function body (WITHOUT declaration wrapper) */
  readonly body: string;
}

/**
 * Inline script content.
 */
export interface IScriptEmission extends IBaseEmission {
  readonly kind: "script";
  /** Script content */
  readonly content: string;
  /** Execution timing */
  readonly timing: ScriptTiming;
}

/**
 * Sources an external file.
 */
export interface ISourceFileEmission extends IBaseEmission {
  readonly kind: "sourceFile";
  /** Path to source (may contain $HOME) */
  readonly path: string;
}

/**
 * Sources inline content via a temporary function.
 * Generates:
 *   tempFunctionName() { <content> }
 *   source <(tempFunctionName)
 *   unset -f tempFunctionName
 */
export interface ISourceEmission extends IBaseEmission {
  readonly kind: "source";
  /** Inline content to source */
  readonly content: string;
  /** Generated unique function name for this source emission */
  readonly functionName: string;
}

/**
 * Sources output of a previously defined function.
 */
export interface ISourceFunctionEmission extends IBaseEmission {
  readonly kind: "sourceFunction";
  /** Name of function to source */
  readonly functionName: string;
}

/**
 * Configuration for completion emission.
 */
export interface ICompletionConfig {
  /** Directories containing completion files */
  directories?: string[];
  /** Specific completion files to source */
  files?: string[];
  /** Command names that have completions to load */
  commands?: string[];
}

/**
 * Configures shell completion for CLI commands.
 */
export interface ICompletionEmission extends IBaseEmission {
  readonly kind: "completion";
  /** Directories containing completion files */
  readonly directories?: string[];
  /** Specific completion files to source */
  readonly files?: string[];
  /** Command names that have completions to load */
  readonly commands?: string[];
}

/**
 * Options for path emission.
 */
export interface IPathOptions {
  /** Where to add (default: prepend) */
  position?: "prepend" | "append";
  /** Emit runtime check to prevent duplicates (default: true) */
  deduplicate?: boolean;
}

/**
 * Modifies the PATH environment variable.
 */
export interface IPathEmission extends IBaseEmission {
  readonly kind: "path";
  /** Directory to add (may contain $HOME) */
  readonly directory: string;
  /** Where to add (default: prepend) */
  readonly position: "prepend" | "append";
  /** Emit runtime check to prevent duplicates (default: true) */
  readonly deduplicate: boolean;
}

/**
 * Union type of all emission types.
 */
export type Emission =
  | IEnvironmentEmission
  | IAliasEmission
  | IFunctionEmission
  | IScriptEmission
  | ISourceEmission
  | ISourceFileEmission
  | ISourceFunctionEmission
  | ICompletionEmission
  | IPathEmission;
