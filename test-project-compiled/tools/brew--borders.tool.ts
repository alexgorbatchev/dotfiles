import { defineTool, Platform } from "@dotfiles/cli";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("brew", {
      formula: "borders",
      tap: "FelixKratz/formulae",
    })
      .bin("borders")
      .zsh((shell) =>
        shell.aliases({
          foo: "bar",
        }),
      ),
  ),
);
