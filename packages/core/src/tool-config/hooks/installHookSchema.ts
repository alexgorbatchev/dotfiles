import { z } from "zod";
import type { AsyncInstallHook, IInstallBaseContext } from "../../installer/installHooks.types";

export type InstallHook = AsyncInstallHook<IInstallBaseContext>;

// Hook function schema - validates that hooks are functions with correct signature
export const installHookSchema = z.custom<InstallHook>((val) => typeof val === "function", "Must be a function");
