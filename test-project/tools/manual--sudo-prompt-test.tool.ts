import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install().platform(Platform.Linux | Platform.MacOS, (install) =>
    install("manual", {
      binaryPath: "/usr/bin/whoami",
    })
      .bin("sudo-prompt-test")
      .sudo(),
  ),
);
