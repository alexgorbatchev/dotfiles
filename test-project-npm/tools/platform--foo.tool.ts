import { defineTool, Platform } from "@dotfiles/cli";

export default defineTool((install, _ctx) =>
  install()
    .bin("foo")
    .platform(Platform.MacOS, (install) => install().bin("foo"))
    .platform(Platform.Linux, (install) => install().bin("foo")),
);
