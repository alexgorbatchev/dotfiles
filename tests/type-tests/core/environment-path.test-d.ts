import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

// Valid: setting normal environment variables
defineTool((install) => install().zsh((shell) => shell.env({ NODE_ENV: "production" })));

// Valid: setting multiple environment variables
defineTool((install) =>
  install().zsh((shell) =>
    shell.env({
      NODE_ENV: "production",
      DEBUG: "true",
      HOME_DIR: "/home/user",
    }),
  ),
);

// Invalid: PATH must be set via shell.path(), not env()
// Type error: Types of property 'PATH' are incompatible (string vs never)
expectError(defineTool((install) => install().zsh((shell) => shell.env({ PATH: "/usr/bin" }))));

// Invalid: PATH mixed with other variables
expectError(
  defineTool((install) =>
    install().zsh((shell) =>
      shell.env({
        NODE_ENV: "production",
        PATH: "/usr/bin",
      }),
    ),
  ),
);

// Valid: cross-shell configuration via .shell()
defineTool((install) =>
  install().shell((shell) => {
    shell.env({ NODE_ENV: "production" });
    shell.alias({ p: "prod" });
    shell.path("/usr/local/bin");
  }),
);

// Invalid: PATH inside .shell().env() must be rejected
expectError(defineTool((install) => install().shell((shell) => shell.env({ PATH: "/usr/bin" }))));
