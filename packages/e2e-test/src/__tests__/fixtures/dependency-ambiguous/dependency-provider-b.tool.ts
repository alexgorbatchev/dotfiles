import { defineTool } from "@dotfiles/cli";

export default defineTool((install) => install("manual", {}).bin("shared-dependency").version("2.0.0"));
