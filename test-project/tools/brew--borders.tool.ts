import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("brew", {
      formula: "borders",
      tap: "FelixKratz/formulae",
      trust: true,
    })
      .bin("borders")
      .zsh((shell) =>
        shell.aliases({
          foo: "bar",
        }),
      ),
  ),
);
