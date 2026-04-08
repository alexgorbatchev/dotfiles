import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual", {}).bin("dependency-platform-consumer").dependsOn("platform-specific-binary").version("1.0.0"),
);
