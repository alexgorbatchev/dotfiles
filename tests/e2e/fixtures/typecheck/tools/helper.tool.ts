import { defineTool } from "@alexgorbatchev/dotfiles";

// Disabled here, as a tool scoped to another platform would be; its binary must still be
// a valid dependsOn() target for the tools scoped alongside it.
export default defineTool((install) => install("manual", { binaryPath: "./helper.sh" }).bin("helper").disable());
