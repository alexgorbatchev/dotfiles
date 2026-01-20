import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'sharkdp/fd',
  }).bin('fd', 'fd*/fd')
);
