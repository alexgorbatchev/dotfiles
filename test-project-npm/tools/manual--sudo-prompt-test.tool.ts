import { defineTool, Platform } from "@dotfiles/cli";

export default defineTool((install) =>
  install().platform(Platform.Unix, (install) =>
    install("manual", {
      binaryPath: "/usr/bin/whoami",
    })
      .bin("sudo-prompt-test")
      .sudo(),
  ),
);
