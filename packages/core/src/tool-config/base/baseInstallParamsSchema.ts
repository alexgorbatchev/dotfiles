import type { Resolvable } from "@dotfiles/unwrap-value";
import { z } from "zod";
import type { IEnvContext } from "../../installer/installHooks.types";
import { installHookSchema } from "../hooks/installHookSchema";
import type { InstallHook } from "../hooks/installHookSchema";

/**
 * Environment variables type - can be static object or function returning object.
 */
export type BaseEnv = Resolvable<IEnvContext, Record<string, string>>;

/**
 * Hook configuration for installation lifecycle events.
 */
export interface IInstallHooks {
  /** Runs before any other installation steps (download, extract, main install command) begin. */
  "before-install"?: InstallHook[];
  /** Runs after download but before extraction or execution. */
  "after-download"?: InstallHook[];
  /** Runs after extraction but before the main binary is finalized. */
  "after-extract"?: InstallHook[];
  /** Runs after the main installation command completes. */
  "after-install"?: InstallHook[];
}

export type InstallHooks = IInstallHooks;

export const baseInstallParamsSchema = z
  .object({
    /**
     * When true, the tool will be automatically installed during the `generate` command
     * if not already installed. This is useful for tools that must be installed before
     * shell initialization can be generated (e.g., zsh plugins that need to be sourced).
     *
     * Default varies by installer:
     * - `zsh-plugin`: defaults to `true`
     * - All other installers: defaults to `false`
     */
    auto: z.boolean().optional(),
    /**
     * A record of environment variables to be set specifically for the duration of this tool's installation process.
     * These variables are applied before any installation commands or hooks are executed.
     * Can be a static object or a function that receives context and returns the object.
     * @example
     * // Static
     * env: { CUSTOM_FLAG: 'true' }
     * // Dynamic
     * env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir })
     */
    env: z.custom<BaseEnv>().optional(),
    /**
     * A collection of optional asynchronous hook functions that can be executed at different stages
     * of the installation lifecycle.
     *
     * Hooks are specified as arrays of functions with kebab-case keys:
     * - 'before-install', 'after-download', 'after-extract', 'after-install'
     */
    hooks: z
      .object({
        /** Runs before any other installation steps (download, extract, main install command) begin. */
        "before-install": z.array(installHookSchema).optional(),
        /** Runs after download but before extraction or execution. */
        "after-download": z.array(installHookSchema).optional(),
        /** Runs after extraction but before the main binary is finalized. */
        "after-extract": z.array(installHookSchema).optional(),
        /** Runs after the main installation command completes. */
        "after-install": z.array(installHookSchema).optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

/**
 * Base interface for parameters common to all installation methods.
 * This includes environment variables to set during installation and a set of lifecycle hooks.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface IBaseInstallParams {
  /**
   * When true, the tool will be automatically installed during the `generate` command
   * if not already installed. This is useful for tools that must be installed before
   * shell initialization can be generated (e.g., zsh plugins that need to be sourced).
   */
  auto?: boolean;
  /**
   * A record of environment variables to be set specifically for the duration of the tool's installation process.
   * Can be a static object or a function that receives context and returns the object.
   */
  env?: BaseEnv;
  /**
   * A collection of optional asynchronous hook functions that can be executed at different stages
   * of the installation lifecycle.
   */
  hooks?: IInstallHooks;
}

export type BaseInstallParams = IBaseInstallParams;
