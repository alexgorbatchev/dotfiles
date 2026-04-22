import { defineTool } from "@dotfiles/cli";

export default defineTool((install, ctx) =>
  install("cargo", { crateName: "eza" })
    .bin("eza")
    .dependsOn("fnm")
    .zsh((shell) =>
      shell
        .aliases({
          el: "eza --all --long --header --icons --group-directories-first",
          ll: "el",
          l: "el",
        })
        .completions(`${ctx.currentDir}/completions/zsh/_eza`),
    ),
);
