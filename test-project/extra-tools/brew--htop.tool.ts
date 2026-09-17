import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("brew", { formula: "htop" })
      .bin("htop")
      .zsh((shell) =>
        shell.aliases({
          top: "htop",
        }),
      ),
  ),
);
