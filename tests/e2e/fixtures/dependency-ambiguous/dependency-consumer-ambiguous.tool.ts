import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual", {}).bin("dependency-consumer-ambiguous").dependsOn("shared-dependency").version("1.0.0"),
);
