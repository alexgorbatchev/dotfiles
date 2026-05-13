import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("pacman", {
    package: "extra/ripgrep",
  }).bin("rg"),
);
