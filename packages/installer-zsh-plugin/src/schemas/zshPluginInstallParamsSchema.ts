import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

/**
 * Parameters for a "zsh-plugin" installation method.
 * This method clones git repositories and automatically sources the plugin.
 */
export const zshPluginInstallParamsSchema = baseInstallParamsSchema
  .extend({
    /**
     * GitHub repository in `user/repo` format.
     * Expanded to `https://github.com/{repo}.git`.
     * Either `repo` or `url` must be specified.
     */
    repo: z
      .string()
      .regex(/^[^/]+\/[^/]+$/, "Must be in user/repo format")
      .optional(),
    /**
     * Full git URL for non-GitHub repositories.
     * Either `repo` or `url` must be specified.
     */
    url: z.string().url().optional(),
    /**
     * Custom plugin name for the cloned directory.
     * Defaults to the repository name (last segment of the path).
     */
    pluginName: z.string().min(1).optional(),
    /**
     * Path to the plugin's main source file relative to the plugin directory.
     * If not specified, auto-detects from common patterns:
     * - {pluginName}.plugin.zsh
     * - {pluginName}.zsh
     * - init.zsh
     * - plugin.zsh
     */
    source: z.string().min(1).optional(),
    /**
     * Whether to automatically source the plugin in shell init.
     * When true (default), the plugin is automatically sourced.
     * Set to false if you want to manually configure sourcing via .zsh().
     * @default true
     */
    auto: z.boolean().default(true),
  })
  .refine((data) => data.repo || data.url, { message: "Either repo or url must be specified" });

/**
 * Parameters for a "zsh-plugin" installation method.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface IZshPluginInstallParams extends IBaseInstallParams {
  /** GitHub repository in `user/repo` format. Either `repo` or `url` must be specified. */
  repo?: string;
  /** Full git URL for non-GitHub repositories. Either `repo` or `url` must be specified. */
  url?: string;
  /** Custom plugin name for the cloned directory. */
  pluginName?: string;
  /** Path to the plugin's main source file relative to the plugin directory. */
  source?: string;
  /** Whether to automatically source the plugin in shell init. @default true */
  auto?: boolean;
}
