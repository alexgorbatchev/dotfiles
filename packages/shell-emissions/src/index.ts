// Types
export type {
  IAliasEmission,
  ICompletionConfig,
  ICompletionEmission,
  Emission,
  EmissionKind,
  IEnvironmentEmission,
  IFunctionEmission,
  IPathEmission,
  IPathOptions,
  IScriptEmission,
  ScriptTiming,
  ISourceEmission,
  ISourceFileEmission,
  ISourceFunctionEmission,
} from "./types/emissions";

export type { IBlock, IBlockMetadata, ISectionOptions } from "./types/blocks";

export type {
  IFormatterConfig,
  IBlockRenderer,
  IEmissionFormatter,
  IOnceScript,
  IOnceScriptContent,
  IRenderedOutput,
} from "./types/formatter";

// Factory functions
export {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  source,
  sourceFile,
  sourceFunction,
  withPriority,
  withSource,
} from "./emissions/factories";

// Type guards
export {
  isAliasEmission,
  isCompletionEmission,
  isEnvironmentEmission,
  isFunctionEmission,
  isHoisted,
  isPathEmission,
  isScriptEmission,
  isSourceEmission,
  isSourceFileEmission,
  isSourceFunctionEmission,
} from "./emissions/guards";

// Builder and Renderer
export { BlockBuilder } from "./blocks/BlockBuilder";
export { BlockRenderer } from "./renderer/BlockRenderer";

// Constants
export { ONCE_SCRIPT_INDEX_PAD_LENGTH, SectionPriority } from "./renderer/constants";

// Errors
export { BlockValidationError } from "./errors/BlockValidationError";
export { EmissionValidationError } from "./errors/EmissionValidationError";
export { RenderError } from "./errors/RenderError";
