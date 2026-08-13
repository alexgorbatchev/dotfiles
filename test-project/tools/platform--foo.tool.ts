import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install("manual")
    .bin("foo")
    .platform(Platform.MacOS, (install) => install("manual").bin("foo"))
    .platform(Platform.Linux, (install) => install("manual").bin("foo")),
);
