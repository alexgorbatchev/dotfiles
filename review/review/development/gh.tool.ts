import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', { repo: 'cli/cli' })
    //
    .bin('gh', 'gh_*/bin/gh')
);
