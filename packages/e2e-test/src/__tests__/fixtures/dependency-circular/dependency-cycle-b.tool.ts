import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual", {}).bin("cycle-b-binary").dependsOn("cycle-a-binary").version("1.0.0"),
);
