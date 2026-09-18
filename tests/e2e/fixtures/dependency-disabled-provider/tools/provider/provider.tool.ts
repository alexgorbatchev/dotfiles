import { defineTool } from "@alexgorbatchev/dotfiles";

// The provider of "provider-bin", disabled on purpose: the binary it declares stays in
// the generated bin-name registry, so other tools may still dependsOn() it.
export default defineTool((install) =>
  install("manual", { binaryPath: "./provider.sh" }).bin("provider-bin").disable(),
);
