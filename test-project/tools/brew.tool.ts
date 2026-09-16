import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("manual", {
      binaryPath: "/opt/homebrew/bin/brew",
      symlink: true,
    })
      .hook("before-install", async ({ $ }) => {
        await $`INTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`;
      })
      .zsh((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"'))
      .bash((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"')),
  ),
);
