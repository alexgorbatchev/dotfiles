import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual", { binaryPath: "./consumer.sh" }).bin("consumer-bin").dependsOn("provider-bin"),
);
