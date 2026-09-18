import { defineTool } from "@alexgorbatchev/dotfiles";

// Takes no part in the dependency at all: it is here to prove the whole run does not
// abort when one tool depends on a disabled tool's binary.
export default defineTool((install) => install("manual", { binaryPath: "./unrelated.sh" }).bin("unrelated-bin"));
