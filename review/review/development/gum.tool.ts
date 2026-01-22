import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'charmbracelet/gum',
  })
    .bin('gum')
    .zsh((shell) => shell.completions(`${ctx.currentDir}/completions/gum.zsh`))
);
