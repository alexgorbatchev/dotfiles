import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("uv", {
    package: "claude-swap-pinned",
    version: ">=0.26.0",
    python: ">=3.12",
  }).bin("claude-swap-pinned"),
);
