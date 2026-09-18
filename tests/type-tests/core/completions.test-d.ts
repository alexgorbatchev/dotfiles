import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

// A path, relative to the tool directory or absolute.
defineTool((install, ctx) =>
  install("manual")
    .bin("tool")
    .zsh((shell) => shell.completions("completions/_tool"))
    .bash((shell) => shell.completions(`${ctx.currentDir}/completions/tool.bash`)),
);

// A command whose output becomes the completion file, optionally naming the binary the
// file is for.
defineTool((install) =>
  install("manual")
    .bin("fnm")
    .zsh((shell) => shell.completions({ cmd: "fnm completions --shell zsh", bin: "fnm" })),
);

// A static file under an explicit key.
defineTool((install) =>
  install("manual")
    .bin("tool")
    .zsh((shell) => shell.completions({ source: "_tool" })),
);

// The runtime generates completions from a command or a file only; there is no URL
// download and no callback form.
type VersionedContext = { version: string };
expectError(
  defineTool((install) => install("manual").zsh((shell) => shell.completions({ url: "https://example.com/_tool" }))),
);
expectError(
  defineTool((install) => install("manual").zsh((shell) => shell.completions((ctx: VersionedContext) => ctx))),
);
