import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("manual", { binaryPath: "./scripted.sh" }).bin("scripted"));
