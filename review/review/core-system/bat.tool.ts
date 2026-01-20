import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'sharkdp/bat',
  })
    .bin('bat', '*/bat')
    .zsh((shell) =>
      shell
        .aliases({
          b: 'bat',
        })
        .completions('*/autocomplete/bat.zsh')
    )
);
