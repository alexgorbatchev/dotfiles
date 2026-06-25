import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("github-release", {
    repo: "enterprise-org/enterprise-tool",
    ghCli: true,
  }).bin("enterprise-tool"),
);
