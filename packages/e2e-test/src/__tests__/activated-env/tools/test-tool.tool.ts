import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install()
    .zsh((shell) => shell.aliases({ 'env-test-alias': 'echo "env tool works"' }))
    .bash((shell) => shell.aliases({ 'env-test-alias': 'echo "env tool works"' }))
);
