import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("apt", {
    package: "ripgrep",
    version: "13.0.0-1",
    update: true,
  })
    .bin("rg")
    .version("latest"),
);
