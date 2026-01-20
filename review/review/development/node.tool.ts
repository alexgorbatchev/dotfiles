import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install().zsh((shell) =>
    shell.always(/* zsh */ `
      # Add local node_modules/.bin to PATH
      export PATH="./node_modules/.bin:$PATH"
    `)
  )
);
