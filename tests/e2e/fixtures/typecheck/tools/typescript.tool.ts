import { defineTool } from "@alexgorbatchev/dotfiles";

// The compiler `dotfiles tool validate` type-checks with; declared without a shim so the
// generated bin directory never carries a `tsc`.
export default defineTool((install) =>
  install("github-release", {
    repo: "microsoft/typescript-go",
    version: "typescript/v7.0.2",
  }).bin("tsc", { shim: false }),
);
