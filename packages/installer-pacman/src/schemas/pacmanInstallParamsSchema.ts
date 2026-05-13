import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

export const pacmanInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The pacman package target to install. If omitted, the tool name is used. */
  package: z.string().min(1).optional(),
  /** Exact package version requirement. pacman receives this as `package=version`. */
  version: z.string().min(1).optional(),
  /** Run `pacman -Syu` instead of `pacman -S` so database refresh is paired with a system upgrade. */
  sysupgrade: z.boolean().optional(),
});

export interface IPacmanInstallParams extends IBaseInstallParams {
  /** The pacman package target to install. */
  package?: string;
  /** Exact package version requirement. */
  version?: string;
  /** Run `pacman -Syu` instead of `pacman -S`. */
  sysupgrade?: boolean;
}
