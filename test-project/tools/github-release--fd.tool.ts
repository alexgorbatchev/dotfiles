import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('github-release', { repo: 'sharkdp/fd' })
    .bin('fd')
    .zsh((shell) =>
      // Use callback-based completions to demonstrate version interpolation
      shell.completions((ctx) => ({
        url: `https://raw.githubusercontent.com/sharkdp/fd/${ctx.version}/contrib/completion/_fd`,
        bin: 'fd',
      }))
    )
);
