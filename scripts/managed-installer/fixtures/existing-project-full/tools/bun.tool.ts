import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual", {
    binaryPath: "__BUN_BINARY__",
  }).bin("bun"),
);
