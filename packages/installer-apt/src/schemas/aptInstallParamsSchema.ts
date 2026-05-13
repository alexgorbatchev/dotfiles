import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

export const aptInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The APT package name to install. If omitted, the tool name is used.
   */
  package: z.string().min(1).optional(),
  /**
   * Exact package version to install. APT receives this as `package=version`.
   */
  version: z.string().min(1).optional(),
  /**
   * Run `apt-get update` before installation.
   *
   * @default false
   */
  update: z.boolean().optional(),
});

export interface IAptInstallParams extends IBaseInstallParams {
  /** The APT package name to install. */
  package?: string;
  /** Exact package version to install. */
  version?: string;
  /** Run `apt-get update` before installation. */
  update?: boolean;
}
