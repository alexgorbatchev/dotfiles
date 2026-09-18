import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

// A binary is declared by name, with a location pattern, or with options.
defineTool((install) => install("github-release", { repo: "owner/tool" }).bin("tool"));
defineTool((install) => install("github-release", { repo: "owner/tool" }).bin("tool", "*/bin/tool"));
defineTool((install) => install("github-release", { repo: "owner/tool" }).bin("tool", /bin\/tool$/));

// Options: where the binary is in the archive, and whether it gets a shim on PATH.
defineTool((install) =>
  install("github-release", { repo: "microsoft/typescript-go", version: "typescript/v7.0.2" }).bin("tsc", {
    shim: false,
  }),
);
defineTool((install) =>
  install("github-release", { repo: "owner/tool" }).bin("tool", { pattern: "*/lib/tool", shim: true }),
);

// The same forms work on a platform builder.
defineTool((install) =>
  install().platform(Platform.Linux, (linux) =>
    linux("github-release", { repo: "owner/tool" }).bin("tool", { shim: false }),
  ),
);

// Only the two options exist.
expectError(defineTool((install) => install("manual").bin("tool", { hidden: true })));
expectError(defineTool((install) => install("manual").bin("tool", { shim: "no" })));

// There is no bulk form: binaries are declared one .bin() call at a time, and the
// runtime has no such method, so the declarations must not offer one.
expectError(defineTool((install) => install("manual").binaries(["one", "two"])));
expectError(
  defineTool((install) => install().platform(Platform.Linux, (linux) => linux("manual").binaries(["one", "two"]))),
);
