import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "junegunn/fzf" })
    .bin("fzf")
    .zsh((shell) => shell.aliases({ fzfi: "fzf -i" })),
);
