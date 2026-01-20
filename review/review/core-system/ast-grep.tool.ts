import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'ast-grep/ast-grep',
  }).bin('ast-grep')
);
