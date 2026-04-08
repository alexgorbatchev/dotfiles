import type { ToolConfig } from "@dotfiles/core";

export interface ILoadToolConfigByBinaryError {
  error: string;
}

export type LoadToolConfigByBinaryResult = ToolConfig | undefined | ILoadToolConfigByBinaryError;
