import { defineTool } from "@alexgorbatchev/dotfiles";

// A manual tool whose command comes from a shell function: it declares .bin() so
// other tools can depend on it, but has no binaryPath for a shim to point at.
export default defineTool((install) =>
  install("manual")
    .bin("shell-fn")
    .zsh((shell) => shell.functions({ "shell-fn": "echo shell-fn" })),
);
