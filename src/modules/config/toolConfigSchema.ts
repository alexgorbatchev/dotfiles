/**
 * @file src/modules/config/toolConfigSchema.ts
 * @description Zod schema for validating ToolConfig objects.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `src/types.ts` (for ToolConfig and related interface definitions)
 *
 * ### Tasks:
 * - [x] Define `SystemInfoSchema`.
 * - [x] Define `ExtractResultSchema`.
 * - [x] Define `GitHubReleaseAssetSchema`.
 * - [x] Define `AsyncInstallHookSchema` (using `z.function()`).
 * - [x] Define `InstallHookContextSchema`.
 * - [x] Define `BaseInstallParamsSchema`.
 * - [x] Define specific `InstallParams` schemas (e.g., `GithubReleaseInstallParamsSchema`).
 * - [x] Define `InstallParamsUnionSchema`.
 * - [x] Define `ShellCompletionConfigSchema`.
 * - [x] Define `CompletionConfigSchema`.
 * - [x] Define `ToolConfigSchema` using `z.object()` and `z.lazy()` for recursion.
 *   - [x] Use `superRefine` for conditional validation between `installationMethod` and `installParams`.
 * - [x] Export `ToolConfigSchema`.
 * - [x] (No dedicated tests needed for this file if it only exports the schema; correctness verified by TSC and consuming code's tests, as per techContext.md and .clinerules for type-only files. However, if complex logic arises, tests might be considered.)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { z } from 'zod';
import type {
  SystemInfo,
  ExtractResult,
  GitHubReleaseAsset,
  InstallHookContext,
  // AsyncInstallHook, // Unused type import
  // BaseInstallParams, // Unused type import
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  ManualInstallParams,
  // InstallParams, // This type is no longer directly used by the Zod schema itself
  ShellCompletionConfig,
  CompletionConfig,
  ToolConfig,
} from '@types';

// Schema for SystemInfo
const SystemInfoSchema: z.ZodType<SystemInfo> = z.object({
  platform: z.string(),
  arch: z.string(),
  release: z.string().optional(),
});

// Schema for ExtractResult
const ExtractResultSchema: z.ZodType<ExtractResult> = z.object({
  extractedFiles: z.array(z.string()),
  executables: z.array(z.string()),
  rootDir: z.string().optional(),
});

// Schema for GitHubReleaseAsset
const GitHubReleaseAssetSchema: z.ZodType<GitHubReleaseAsset> = z.object({
  name: z.string(),
  browser_download_url: z.string().url(),
  size: z.number(),
  content_type: z.string(),
  state: z.enum(['uploaded', 'open']),
  download_count: z.number(),
  created_at: z.string(), // Can be refined with z.string().datetime() if specific format is enforced
  updated_at: z.string(), // Can be refined with z.string().datetime()
});

// Schema for InstallHookContext
// We need to define this before AsyncInstallHookSchema
const InstallHookContextSchema: z.ZodType<InstallHookContext> = z.object({
  toolName: z.string(),
  installDir: z.string(),
  downloadPath: z.string().optional(),
  extractDir: z.string().optional(),
  extractResult: ExtractResultSchema.optional(),
  systemInfo: SystemInfoSchema.optional(),
});

// Schema for AsyncInstallHook (as a function)
const AsyncInstallHookSchema = z // Removed explicit ZodType for inference
  .function()
  .args(InstallHookContextSchema)
  .returns(z.promise(z.void()));

// Schema for BaseInstallParams
const BaseInstallParamsSchema = z.object({
  // Removed explicit ZodType for inference
  env: z.record(z.string()).optional(),
  hooks: z
    .object({
      beforeInstall: AsyncInstallHookSchema.optional(),
      afterDownload: AsyncInstallHookSchema.optional(),
      afterExtract: AsyncInstallHookSchema.optional(),
      afterInstall: AsyncInstallHookSchema.optional(),
    })
    .optional(),
});

// Schema for GithubReleaseInstallParams
const GithubReleaseInstallParamsSchema: z.ZodType<GithubReleaseInstallParams> =
  BaseInstallParamsSchema.extend({
    repo: z.string(),
    assetPattern: z.string().optional(),
    binaryPath: z.string().optional(),
    moveBinaryTo: z.string().optional(),
    version: z.string().optional(),
    includePrerelease: z.boolean().optional(),
    assetSelector: z
      .function()
      .args(z.array(GitHubReleaseAssetSchema), SystemInfoSchema)
      .returns(GitHubReleaseAssetSchema.optional())
      .optional(),
  });

// Schema for BrewInstallParams
const BrewInstallParamsSchema: z.ZodType<BrewInstallParams> = BaseInstallParamsSchema.extend({
  formula: z.string().optional(),
  cask: z.boolean().optional(),
  tap: z.union([z.string(), z.array(z.string())]).optional(),
});

// Schema for CurlScriptInstallParams
const CurlScriptInstallParamsSchema: z.ZodType<CurlScriptInstallParams> =
  BaseInstallParamsSchema.extend({
    url: z.string().url(),
    shell: z.enum(['bash', 'sh']),
  });

// Schema for CurlTarInstallParams
const CurlTarInstallParamsSchema: z.ZodType<CurlTarInstallParams> = BaseInstallParamsSchema.extend({
  url: z.string().url(),
  extractPath: z.string().optional(),
  moveBinaryTo: z.string().optional(),
});

// Schema for ManualInstallParams
const ManualInstallParamsSchema: z.ZodType<ManualInstallParams> = BaseInstallParamsSchema.extend({
  binaryPath: z.string(),
});

// Schema for ShellCompletionConfig
const ShellCompletionConfigSchema: z.ZodType<ShellCompletionConfig> = z.object({
  source: z.string(),
  name: z.string().optional(),
  targetDir: z.string().optional(),
});

// Schema for CompletionConfig
const CompletionConfigSchema: z.ZodType<CompletionConfig> = z.object({
  zsh: ShellCompletionConfigSchema.optional(),
  bash: ShellCompletionConfigSchema.optional(),
  fish: ShellCompletionConfigSchema.optional(),
});

// Base properties schema for all ToolConfig variants
const BaseToolConfigPropertiesSchema = z.object({
  name: z.string(),
  binaries: z.array(z.string()).optional(), // Make binaries optional at the base level
  version: z.string(),
  zshInit: z.array(z.string()).optional(),
  symlinks: z.array(z.object({ source: z.string(), target: z.string() })).optional(),
  completions: CompletionConfigSchema.optional(),
  updateCheck: z
    .object({
      enabled: z.boolean().optional(),
      constraint: z.string().optional(),
    })
    .optional(),
});

// Need to define archOverrides with z.lazy due to recursion with ToolConfig itself
const ArchOverridesSchema: z.ZodType<
  Record<string, Partial<Omit<ToolConfig, 'name' | 'archOverrides'>>>
> = z.lazy(() =>
  z.record(
    z.string(),
    // Use a base object schema that can be .omit().partial()
    // BaseToolConfigPropertiesWithArchSchema itself is an object schema.
    BaseToolConfigPropertiesWithArchSchema.omit({
      name: true, // Name is fixed for the main tool, override shouldn't change it.
      archOverrides: true, // Prevent nested archOverrides.
    }).partial()
  )
);

const BaseToolConfigPropertiesWithArchSchema = BaseToolConfigPropertiesSchema.extend({
  archOverrides: ArchOverridesSchema.optional(),
});
// Schemas for each specific ToolConfig type based on installationMethod
// These schemas will enforce that 'binaries' is present and non-empty.
const GithubReleaseToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('github-release'),
  installParams: GithubReleaseInstallParamsSchema,
  binaries: z.array(z.string()).min(1),
});

const BrewToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('brew'),
  installParams: BrewInstallParamsSchema,
  binaries: z.array(z.string()).min(1),
});

const CurlScriptToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('curl-script'),
  installParams: CurlScriptInstallParamsSchema,
  binaries: z.array(z.string()).min(1),
});

const CurlTarToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('curl-tar'),
  installParams: CurlTarInstallParamsSchema,
  binaries: z.array(z.string()).min(1),
});

const ManualToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('manual'),
  installParams: ManualInstallParamsSchema,
  binaries: z.array(z.string()).min(1),
});

// Schema for tools that might not have an installation method
const NoInstallToolConfigSchema = BaseToolConfigPropertiesWithArchSchema.extend({
  installationMethod: z.literal('none'), // Use 'none' as an explicit discriminant value
  installParams: z.undefined().optional(), // Can be absent
  // binaries are already optional in BaseToolConfigPropertiesSchema
});

// Final ToolConfig schema using discriminated union
export const ToolConfigSchema: z.ZodType<ToolConfig> = z
  .discriminatedUnion(
    // Discriminator field
    'installationMethod',
    // Array of schemas for each variant
    [
      GithubReleaseToolConfigSchema,
      BrewToolConfigSchema,
      CurlScriptToolConfigSchema,
      CurlTarToolConfigSchema,
      ManualToolConfigSchema,
      NoInstallToolConfigSchema, // This should be last or handled carefully if installationMethod can be truly absent
    ]
  )
  .superRefine((data, ctx) => {
    // Validation: If binaries are defined and non-empty, an installationMethod is usually expected,
    // unless it's a NoInstallToolConfig where binaries might be empty or absent.
    // The discriminated union handles the matching of installParams to installationMethod.
    // We need to ensure that if `binaries` is present and non-empty, `installationMethod` is also present,
    // OR it's a NoInstallToolConfig where `binaries` might be empty/absent.

    // `data` here is the full discriminated union.
    // We need to check the discriminant `installationMethod` to narrow down the type of `data`.
    if (data.installationMethod === 'none') {
      // data is NoInstallToolConfig
      if (
        (!data.binaries || data.binaries.length === 0) &&
        (!data.zshInit || data.zshInit.length === 0) &&
        (!data.symlinks || data.symlinks.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A tool configuration with no installation method must define at least binaries, zshInit, or symlinks.',
          path: ['name'],
        });
      }
    }
    // The individual schemas for specific installation methods (GithubReleaseToolConfigSchema, etc.)
    // already enforce that `binaries` is a non-empty array.
    // The discriminatedUnion ensures that if `installationMethod` is not 'none',
    // `data` must conform to one of those schemas.
  });

// Removed unused planMarker, planEndMarker, tasks, originalContent, finalContent constants
