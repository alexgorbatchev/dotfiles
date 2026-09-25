import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("uv", {
    package: "claude-swap",
    python: ">=3.12",
  })
    .bin("claude-swap")
    .bin("cswap"),
);
