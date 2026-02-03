import { defineTool } from '@dotfiles/cli';

/**
 * Test tool for verifying auto-install behavior during generate command.
 *
 * The `auto: true` parameter causes this tool to be automatically installed
 * when running `dotfiles generate`, without needing a separate `dotfiles install`.
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'repo/auto-install-tool',
    auto: true,
  })
    .bin('auto-install-tool')
    .version('latest')
    .zsh((shell) =>
      shell.env({
        AUTO_INSTALL_TOOL_HOME: '~/.auto-install-tool',
      })
    )
);
