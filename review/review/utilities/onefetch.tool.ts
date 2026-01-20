import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'o2sh/onefetch',
  }).bin('onefetch')
);
