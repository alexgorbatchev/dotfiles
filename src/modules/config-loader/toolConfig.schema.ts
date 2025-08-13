import { z } from 'zod';

// Simplified validation schema that focuses on essential structure
// rather than perfect type matching with branded types

// Basic tool config validation schema
export const toolConfigSchema = z
  .object({
    /** The unique name of the tool */
    name: z.string().min(1),
    /** An array of binary names that should have shims generated for this tool */
    binaries: z.array(z.string().min(1)).optional(),
    /** The desired version of the tool */
    version: z.string().default('latest'),
    /** The installation method to use */
    installationMethod: z.enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'manual', 'none']),
    /** Parameters specific to the installation method */
    installParams: z.record(z.string(), z.any()).optional(),
    /** The absolute path to the tool configuration file */
    configFilePath: z.string().optional(),
    /** Shell configurations organized by shell type */
    shellConfigs: z
      .object({
        zsh: z
          .object({
            scripts: z.array(z.union([z.string(), z.instanceof(String)])).optional(),
            aliases: z.record(z.string(), z.string()).optional(),
            environment: z.record(z.string(), z.string()).optional(),
          })
          .strict()
          .optional(),
        bash: z
          .object({
            scripts: z.array(z.union([z.string(), z.instanceof(String)])).optional(),
            aliases: z.record(z.string(), z.string()).optional(),
            environment: z.record(z.string(), z.string()).optional(),
          })
          .strict()
          .optional(),
        powershell: z
          .object({
            scripts: z.array(z.union([z.string(), z.instanceof(String)])).optional(),
            aliases: z.record(z.string(), z.string()).optional(),
            environment: z.record(z.string(), z.string()).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** An array of symlink configurations */
    symlinks: z
      .array(
        z
          .object({
            source: z.string().min(1),
            target: z.string().min(1),
          })
          .strict()
      )
      .optional(),
    /** Shell completion configurations */
    completions: z
      .object({
        zsh: z
          .object({
            source: z.string().min(1),
            name: z.string().optional(),
            targetDir: z.string().optional(),
          })
          .strict()
          .optional(),
        bash: z
          .object({
            source: z.string().min(1),
            name: z.string().optional(),
            targetDir: z.string().optional(),
          })
          .strict()
          .optional(),
        powershell: z
          .object({
            source: z.string().min(1),
            name: z.string().optional(),
            targetDir: z.string().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Configuration for automatic update checking for this tool */
    updateCheck: z
      .object({
        enabled: z.boolean().default(true),
        constraint: z.string().optional(),
      })
      .strict()
      .optional(),
    /** An array of platform-specific configurations */
    platformConfigs: z.array(z.record(z.string(), z.any())).optional(),
  })
  .strict()
  // Additional validation for specific installation methods
  .refine(
    (data) => {
      if (data.installationMethod === 'github-release') {
        return (
          data.installParams &&
          typeof data.installParams === 'object' &&
          'repo' in data.installParams &&
          typeof data.installParams['repo'] === 'string' &&
          data.installParams['repo'].includes('/')
        );
      }
      return true;
    },
    {
      message: 'GitHub release installation method requires installParams.repo in "owner/repo" format',
      path: ['installParams', 'repo'],
    }
  )
  .refine(
    (data) => {
      if (data.installationMethod === 'brew') {
        return (
          data.installParams &&
          typeof data.installParams === 'object' &&
          'formula' in data.installParams &&
          typeof data.installParams['formula'] === 'string' &&
          data.installParams['formula'].length > 0
        );
      }
      return true;
    },
    {
      message: 'Brew installation method requires installParams.formula',
      path: ['installParams', 'formula'],
    }
  )
  .refine(
    (data) => {
      if (['github-release', 'brew', 'curl-script', 'curl-tar', 'manual'].includes(data.installationMethod)) {
        return data.binaries && data.binaries.length > 0;
      }
      return true;
    },
    {
      message: 'Installation methods other than "none" typically require at least one binary',
      path: ['binaries'],
    }
  );

// Type export for TypeScript inference
export type ToolConfigSchema = z.infer<typeof toolConfigSchema>;
