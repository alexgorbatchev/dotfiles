import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("pacman", {
    package: "ripgrep",
    version: "13.0.0-1",
    sysupgrade: true,
  })
    .bin("rg")
    .version("latest"),
);
