import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("github-release", { repo: "alexgorbatchev/dotfiles" }).bin("dotfiles"));
