import { z } from 'zod';

export const gitHubAssetSchema = z.object({
  id: z.number(),
  name: z.string(),
  label: z.string().nullable(),
  content_type: z.string(),
  state: z.string(),
  size: z.number(),
  download_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  browser_download_url: z.string(),
  url: z.string(),
});

export const gitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string(),
  published_at: z.string().nullable(),
  assets: z.array(gitHubAssetSchema),
  tarball_url: z.string().nullable(),
  zipball_url: z.string().nullable(),
  body: z.string().nullable(),
  html_url: z.string(),
  url: z.string(),
});

export const gitHubRateLimitResourceSchema = z.object({
  limit: z.number(),
  remaining: z.number(),
  reset: z.number(),
  used: z.number(),
});

export const gitHubRateLimitSchema = z.object({
  resources: z.object({
    core: gitHubRateLimitResourceSchema,
    search: gitHubRateLimitResourceSchema,
    graphql: gitHubRateLimitResourceSchema,
    integration_manifest: gitHubRateLimitResourceSchema.optional(),
    source_import: gitHubRateLimitResourceSchema.optional(),
    code_scanning_upload: gitHubRateLimitResourceSchema.optional(),
  }),
  rate: gitHubRateLimitResourceSchema,
});

export type GitHubAsset = z.infer<typeof gitHubAssetSchema>;
export type GitHubRelease = z.infer<typeof gitHubReleaseSchema>;
export type GitHubRateLimitResource = z.infer<typeof gitHubRateLimitResourceSchema>;
export type GitHubRateLimit = z.infer<typeof gitHubRateLimitSchema>;
