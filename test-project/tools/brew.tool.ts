import { defineTool, type IToolConfigContext, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install("manual", {
      binaryPath: "/opt/homebrew/bin/brew",
    }).hook("before-install", async ({ $ }: IToolConfigContext) => {
      await $`INTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`;
    }),
  ),
);
