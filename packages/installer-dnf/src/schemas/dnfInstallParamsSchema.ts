import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

export const dnfInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The DNF package spec to install. If omitted, the tool name is used. */
  package: z.string().min(1).optional(),
  /** Exact version/release suffix to install. DNF receives this as `package-version`. */
  version: z.string().min(1).optional(),
  /** Run `dnf makecache` before installation. */
  refresh: z.boolean().optional(),
});

export interface IDnfInstallParams extends IBaseInstallParams {
  /** The DNF package spec to install. */
  package?: string;
  /** Exact version/release suffix to install. */
  version?: string;
  /** Run `dnf makecache` before installation. */
  refresh?: boolean;
}
