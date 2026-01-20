import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'kardolus/chatgpt-cli',
  })
    .bin('chatgpt')
    .zsh((shell) =>
      shell.aliases({
        gpt: 'chatgpt',
      })
    )
);
