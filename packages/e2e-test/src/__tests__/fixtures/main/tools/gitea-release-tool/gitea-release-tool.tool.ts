import { defineTool } from '@dotfiles/cli';

const mockServerHost = process.env['MOCK_SERVER_PORT']
  ? `http://127.0.0.1:${process.env['MOCK_SERVER_PORT']}`
  : 'http://127.0.0.1:8765';

export default defineTool((install) =>
  install('gitea-release', {
    instanceUrl: mockServerHost,
    repo: 'repo/gitea-release-tool',
  })
    .bin('gitea-release-tool')
    .version('latest')
    .zsh((shell) =>
      shell
        .env({
          GITEA_RELEASE_TOOL_OPTS: '--color=auto',
        })
        .aliases({
          grt2: 'gitea-release-tool --verbose',
        })
    )
);
