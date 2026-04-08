import type { ToolConfig } from "@dotfiles/core";

export type ToolConfigWithSymlinks = ToolConfig & {
  symlinks: NonNullable<ToolConfig["symlinks"]>;
};

export type ToolConfigWithCopies = ToolConfig & {
  copies: NonNullable<ToolConfig["copies"]>;
};
