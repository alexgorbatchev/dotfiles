import { defineTool } from "@alexgorbatchev/dotfiles";

// The TypeScript compiler that "dotfiles tool validate" type-checks tool configurations
// with. It has no shim, so it never shadows another project's TypeScript on PATH;
// "dotfiles tool validate" runs it from this tool's current directory.
export default defineTool((install) =>
  install("github-release", {
    repo: "microsoft/typescript-go",
    version: "typescript/v7.0.2",
  }).bin("tsc", { shim: false }),
);
