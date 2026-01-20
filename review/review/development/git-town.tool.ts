import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'git-town/git-town',
  })
    .bin('git-town')
    .hook('after-install', async ({ $ }) => {
      // Generate completions
      await $`git-town completions zsh > ${ctx.toolDir}/_git-town`;
    })
    .zsh((shell) => shell.completions('./_git-town'))
);
