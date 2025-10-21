import { z } from 'zod';

export const cargoVersionSchema = z.object({
  num: z.string(),
  dl_path: z.string(),
  readme_path: z.string(),
  updated_at: z.string(),
  created_at: z.string(),
  downloads: z.number(),
  features: z.record(z.string(), z.array(z.string())),
  yanked: z.boolean(),
  license: z.string().nullable(),
  links: z
    .object({
      dependencies: z.string(),
      version_downloads: z.string(),
      authors: z.string(),
    })
    .optional(),
  crate_size: z.number().optional(),
  published_by: z
    .object({
      id: z.number(),
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable()
    .optional(),
  audit_actions: z.array(z.unknown()).optional(),
});

export const cargoMetadataSchema = z.object({
  crate: z.object({
    id: z.string(),
    name: z.string(),
    updated_at: z.string(),
    versions: z.array(z.number()).optional(),
    keywords: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    badges: z.array(z.unknown()).optional(),
    created_at: z.string(),
    downloads: z.number(),
    recent_downloads: z.number().optional(),
    max_version: z.string(),
    newest_version: z.string(),
    max_stable_version: z.string().nullable(),
    description: z.string().nullable(),
    homepage: z.string().nullable(),
    documentation: z.string().nullable(),
    repository: z.string().nullable(),
    links: z.object({
      version_downloads: z.string(),
      versions: z.string().optional(),
      owners: z.string(),
      owner_team: z.string().optional(),
      owner_user: z.string().optional(),
      reverse_dependencies: z.string(),
    }),
    exact_match: z.boolean().optional(),
  }),
  versions: z.array(cargoVersionSchema),
  keywords: z.array(z.unknown()).optional(),
  categories: z.array(z.unknown()).optional(),
});

export type CargoVersion = z.infer<typeof cargoVersionSchema>;
export type CargoMetadata = z.infer<typeof cargoMetadataSchema>;
