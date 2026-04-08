// Types
export type {
  AliasEmission,
  CompletionConfig,
  CompletionEmission,
  Emission,
  EmissionKind,
  EnvironmentEmission,
  FunctionEmission,
  PathEmission,
  PathOptions,
  ScriptEmission,
  ScriptTiming,
  SourceEmission,
  SourceFileEmission,
  SourceFunctionEmission,
} from "./types/emissions";

export type { Block, BlockMetadata, SectionOptions } from "./types/blocks";

export type {
  FormatterConfig,
  IBlockRenderer,
  IEmissionFormatter,
  OnceScript,
  OnceScriptContent,
  RenderedOutput,
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
