import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual", {}).bin("dependency-consumer-missing").dependsOn("missing-provider").version("1.0.0"),
);
