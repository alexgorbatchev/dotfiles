import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'ClementTsang/bottom',
  }).bin('btm')
);
