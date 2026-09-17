import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("cargo", { crateName: "zoxide" })
    .bin("zoxide")
    .zsh((shell) =>
      shell
        .aliases({
          zi: "zoxide query --interactive",
        })
        .always('eval "$(zoxide init zsh)"'),
    ),
);
