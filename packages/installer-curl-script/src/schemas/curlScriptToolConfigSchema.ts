import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { curlScriptInstallParamsSchema } from './curlScriptInstallParamsSchema';

export const curlScriptToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'curl-script' installation method */
  installationMethod: z.literal('curl-script'),
  /** Curl script installation parameters */
  installParams: curlScriptInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

// TODO use prettytypedeep
type PrettyTypeDeep<TValue> = TValue extends (...arguments_: unknown[]) => unknown
  ? TValue
  : TValue extends readonly unknown[]
    ? { [TIndex in keyof TValue]: PrettyTypeDeep<TValue[TIndex]> }
    : TValue extends Record<PropertyKey, unknown>
      ? { [TKey in keyof TValue]: PrettyTypeDeep<TValue[TKey]> }
      : TValue;

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = PrettyTypeDeep<InferToolConfigWithPlatforms<typeof curlScriptToolConfigSchema>>;
