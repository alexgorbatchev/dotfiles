import { defineTool } from '@gitea/dotfiles';
import { expectError } from 'tsd';

// Valid: setting normal environment variables
defineTool((install) => install().zsh((shell) => shell.environment({ NODE_ENV: 'production' })));

// Valid: setting multiple environment variables
defineTool((install) =>
  install().zsh((shell) =>
    shell.environment({
      NODE_ENV: 'production',
      DEBUG: 'true',
      HOME_DIR: '/home/user',
    })
  )
);

// Invalid: PATH must be set via shell.path(), not environment()
// Error message: "ERROR: Use shell.path() to modify PATH, not environment({ PATH: ... })"
expectError(defineTool((install) => install().zsh((shell) => shell.environment({ PATH: '/usr/bin' }))));

// Invalid: PATH mixed with other variables
expectError(
  defineTool((install) =>
    install().zsh((shell) =>
      shell.environment({
        NODE_ENV: 'production',
        PATH: '/usr/bin',
      })
    )
  ),
);
