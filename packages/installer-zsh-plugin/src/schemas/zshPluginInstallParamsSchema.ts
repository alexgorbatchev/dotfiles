import type { BaseInstallParams } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

/**
 * Parameters for a "zsh-plugin" installation method.
 * This method clones git repositories into a plugins directory for use with zsh.
 */
export const zshPluginInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * GitHub repository in `user/repo` format.
   * Expanded to `https://github.com/{repo}.git`.
   * Either `repo` or `url` must be specified.
   */
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Must be in user/repo format').optional(),
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
   * Target directory for the plugin symlink.
   * Defaults to $ZSH_CUSTOM/plugins or ~/.oh-my-zsh/custom/plugins if $ZSH_CUSTOM is not set.
   * The plugin will be symlinked to {target}/{pluginName}.
   */
  target: z.string().min(1).optional(),
}).refine(
  (data) => data.repo || data.url,
  { message: 'Either repo or url must be specified' },
);

/**
 * Parameters for a "zsh-plugin" installation method.
 */
export type ZshPluginInstallParams = BaseInstallParams & z.infer<typeof zshPluginInstallParamsSchema>;
