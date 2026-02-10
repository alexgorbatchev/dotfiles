import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('github-release', {
    repo: 'org/gh-cli-test-tool',
    ghCli: true,
  }).bin('gh-cli-test-tool')
);
