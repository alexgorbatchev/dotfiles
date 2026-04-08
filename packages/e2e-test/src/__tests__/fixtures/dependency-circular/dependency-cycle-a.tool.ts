import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual", {}).bin("cycle-a-binary").dependsOn("cycle-b-binary").version("1.0.0"),
);
