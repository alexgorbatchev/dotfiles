import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'abhinav/restack',
  })
    .bin('restack')
    .zsh((shell) =>
      shell.aliases({
        gr: 'exec git -c sequence.editor="restack edit" rebase -i "$@"',
      })
    )
);
