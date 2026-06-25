import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("dnf", {
    package: "ripgrep",
    version: "13.0.0-1.fc40",
    refresh: true,
  })
    .bin("rg")
    .version("latest"),
);
