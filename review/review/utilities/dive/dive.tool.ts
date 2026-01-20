import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'wagoodman/dive',
  })
    .bin('dive')
    .symlink('./dive.yaml', '~/.config/dive/dive.yaml')
);
