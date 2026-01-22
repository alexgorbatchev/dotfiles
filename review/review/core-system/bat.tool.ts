import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'sharkdp/bat',
  })
    .bin('bat', '*/bat')
    .zsh((shell) =>
      shell
        .aliases({
          b: 'bat',
        })
        .completions(`${ctx.currentDir}/*/autocomplete/bat.zsh`)
    )
);
