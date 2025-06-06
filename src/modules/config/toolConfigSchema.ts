/**
 * @file generator/src/modules/config/toolConfigSchema.ts
 * @description Zod schema for validating ToolConfig objects.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `generator/src/types.ts` (for ToolConfig and related interface definitions)
 * - `.clinerules` (for file structure, naming, and content guidelines)
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
  PipInstallParams,
  ManualInstallParams,
  InstallParams,
  ShellCompletionConfig,
  CompletionConfig,
  ToolConfig,
} from '../../types';

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

// Schema for PipInstallParams
const PipInstallParamsSchema: z.ZodType<PipInstallParams> = BaseInstallParamsSchema.extend({
  packageName: z.string(),
});

// Schema for ManualInstallParams
const ManualInstallParamsSchema: z.ZodType<ManualInstallParams> = BaseInstallParamsSchema.extend({
  binaryPath: z.string(),
});

// Union schema for all InstallParams types
const InstallParamsUnionSchema: z.ZodType<InstallParams> = z.union([
  GithubReleaseInstallParamsSchema,
  BrewInstallParamsSchema,
  CurlScriptInstallParamsSchema,
  CurlTarInstallParamsSchema,
  PipInstallParamsSchema,
  ManualInstallParamsSchema,
]);

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

// Forward declaration for the recursive part of ToolConfig
type ToolConfigRecursive = Omit<ToolConfig, 'name' | 'archOverrides'>;
const PartialToolConfigOmitNameArchSchema: z.ZodType<Partial<ToolConfigRecursive>> = z.lazy(() =>
  InternalToolConfigSchema.omit({ name: true, archOverrides: true }).partial()
);

// Base ToolConfig schema without superRefine, for recursion
const InternalToolConfigSchema = z.object({
  name: z.string(),
  binaries: z.array(z.string()).min(1),
  version: z.string(),
  installationMethod: z
    .enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'pip', 'manual'])
    .optional(),
  installParams: InstallParamsUnionSchema.optional(),
  zshInit: z.array(z.string()).optional(),
  symlinks: z.array(z.object({ source: z.string(), target: z.string() })).optional(),
  archOverrides: z.record(z.string(), PartialToolConfigOmitNameArchSchema).optional(),
  completions: CompletionConfigSchema.optional(),
  updateCheck: z
    .object({
      enabled: z.boolean().optional(),
      constraint: z.string().optional(),
    })
    .optional(),
});

// Final ToolConfig schema with superRefine for conditional validation
export const ToolConfigSchema: z.ZodType<ToolConfig> = InternalToolConfigSchema.superRefine(
  (data, ctx) => {
    if (data.installationMethod && data.installParams === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'installParams is required when installationMethod is set.',
        path: ['installParams'],
      });
    }
    if (data.installParams !== undefined && !data.installationMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'installationMethod is required when installParams are provided.',
        path: ['installationMethod'],
      });
    }

    if (data.installationMethod && data.installParams) {
      let parseResult: { success: boolean; error?: z.ZodError } = { success: false };
      switch (data.installationMethod) {
        case 'github-release':
          parseResult = GithubReleaseInstallParamsSchema.safeParse(data.installParams);
          break;
        case 'brew':
          parseResult = BrewInstallParamsSchema.safeParse(data.installParams);
          break;
        case 'curl-script':
          parseResult = CurlScriptInstallParamsSchema.safeParse(data.installParams);
          break;
        case 'curl-tar':
          parseResult = CurlTarInstallParamsSchema.safeParse(data.installParams);
          break;
        case 'pip':
          parseResult = PipInstallParamsSchema.safeParse(data.installParams);
          break;
        case 'manual':
          parseResult = ManualInstallParamsSchema.safeParse(data.installParams);
          break;
        default:
          // Should not happen due to enum validation on installationMethod
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown installationMethod: ${data.installationMethod}`,
            path: ['installationMethod'],
          });
          return;
      }

      if (!parseResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `installParams do not match the schema for installationMethod "${data.installationMethod}". Issues: ${parseResult.error?.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          path: ['installParams'],
        });
      }
    }
  }
);

// Removed unused planMarker, planEndMarker, tasks, originalContent, finalContent constants
