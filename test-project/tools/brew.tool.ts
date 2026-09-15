import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .platform(Platform.MacOS, (install) =>
      install("curl-script", {
        url: "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh",
        shell: "bash",
        env: {
          NONINTERACTIVE: "1",
        },
      }).bin("brew"),
    )
    .platform(Platform.MacOS, Architecture.Arm64, (install) =>
      install()
        .zsh((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"'))
        .bash((shell) => shell.always('eval "$(/opt/homebrew/bin/brew shellenv)"')),
    )
    .platform(Platform.MacOS, Architecture.X86_64, (install) =>
      install()
        .zsh((shell) => shell.always('eval "$(/usr/local/bin/brew shellenv)"'))
        .bash((shell) => shell.always('eval "$(/usr/local/bin/brew shellenv)"')),
    ),
);
