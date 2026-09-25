import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

// install.<method> is not supported at runtime -- must use install("method", { ... })
expectError(() => defineTool((install) => install.brew({ formula: "ripgrep" })));
expectError(() => defineTool((install) => install.manual({ binaryPath: "/bin/sh" })));
expectError(() => defineTool((install) => install.cargo({ package: "ripgrep" })));
expectError(() => defineTool((install) => install.npm({ package: "typescript" })));
expectError(() => defineTool((install) => install.apt({ package: "curl" })));

// Platform callback install.<method> is likewise rejected
expectError(() =>
  defineTool((install) =>
    install().platform(1, (platInstall) => {
      platInstall.brew({ formula: "ripgrep" });
    }),
  ),
);
