import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'mvdan/sh',
  }).bin('shfmt', 'shfmt_*')
);
