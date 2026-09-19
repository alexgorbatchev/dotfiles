import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";
import type { IToolConfigContext } from "@alexgorbatchev/dotfiles";

// A directory is declared by path, with or without the permission it needs.
defineTool((install) => install("manual").ensureDir("~/.ssh"));
defineTool((install) => install("manual").ensureDir("~/.ssh", { mode: "0700" }));

// A symlink may state the permission of what it points at.
defineTool((install) => install("manual").symlink("id_rsa", "~/.ssh/id_rsa"));
defineTool((install) => install("manual").symlink("id_rsa", "~/.ssh/id_rsa", { mode: "0600" }));

// A copy may state a permission and a conflict policy.
defineTool((install) => install("manual").copy("config", "~/.config/tool/config"));
defineTool((install) =>
  install("manual").copy("config", "~/.config/tool/config", { mode: "0644", conflict: "keep-local" }),
);

// A block's content may be a string, a callback, or an async callback, and the
// callback receives the tool context.
defineTool((install) => install("manual").block("~/.ssh/config", { id: "includes", content: "Include x" }));
defineTool((install) =>
  install("manual").block("~/.ssh/config", {
    id: "includes",
    content: (ctx) => {
      expectType<IToolConfigContext>(ctx);
      return `Include ${ctx.toolDir}/config`;
    },
  }),
);
defineTool((install) =>
  install("manual").block("~/.ssh/config", {
    id: "includes",
    mode: "0600",
    position: "top",
    conflict: "merge",
    content: async (ctx) => `Include ${ctx.toolDir}/config`,
  }),
);

// A template's variables may be given directly or computed.
defineTool((install) => install("manual").template("./gitconfig.template", "~/.gitconfig"));
defineTool((install) =>
  install("manual").template("./gitconfig.template", "~/.gitconfig", {
    mode: "0644",
    conflict: "overwrite",
    variables: { email: "alex@example.com", signingKey: "ssh-ed25519 AAAA" },
  }),
);
defineTool((install) =>
  install("manual").template("./gitconfig.template", "~/.gitconfig", {
    variables: async (ctx) => ({
      diffTool: ctx.systemInfo.os === "darwin" ? "opendiff" : "vimdiff",
    }),
  }),
);

// Every one of these is available inside a .platform() block too, which is where a
// platform-specific include or mode belongs.
defineTool((install) =>
  install("manual").platform(Platform.MacOS, (install) =>
    install()
      .ensureDir("~/.ssh", { mode: "0700" })
      .block("~/.ssh/config", { id: "macos", content: "Include config.macos" })
      .template("./gitconfig.template", "~/.gitconfig", { variables: { diffTool: "opendiff" } }),
  ),
);

// A block without an id cannot be written: the id is what finds the region again.
expectError(defineTool((install) => install("manual").block("~/.ssh/config", { content: "Include x" })));

// A block without content declares a region with nothing to put in it.
expectError(defineTool((install) => install("manual").block("~/.ssh/config", { id: "includes" })));

// A policy or position the engine does not implement is rejected rather than
// silently falling back to the default.
expectError(
  defineTool((install) =>
    install("manual").block("~/.ssh/config", { id: "includes", content: "x", conflict: "rebase" }),
  ),
);
expectError(
  defineTool((install) =>
    install("manual").block("~/.ssh/config", { id: "includes", content: "x", position: "middle" }),
  ),
);
expectError(
  defineTool((install) => install("manual").copy("config", "~/.config/tool/config", { conflict: "rebase" })),
);

// An unknown option is a typo, not a value to ignore.
expectError(defineTool((install) => install("manual").ensureDir("~/.ssh", { permissions: "0700" })));
expectError(
  defineTool((install) =>
    install("manual").block("~/.ssh/config", { id: "includes", content: "x", comment: "#" }),
  ),
);
