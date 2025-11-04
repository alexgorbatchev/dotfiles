import { defineTool } from '@dotfiles/cli';
import { always, once } from '@dotfiles/core';

export default defineTool((install) =>
  install('cargo', {
    crateName: 'cargo-quickinstall-tool',
  })
    .bin('cargo-quickinstall-tool')
    .version('latest')
    .zsh({
      environment: {
        CARGO_QUICKINSTALL_TOOL_DEFAULT_OPTS: '--color=fg',
        CARGO_QUICKINSTALL_TOOL_OTHER_OPTS: '--arg=1',
      },
      aliases: {
        cqt: 'cargo-quickinstall-tool --preview "ps -f -p {+}"',
      },
      completions: {
        source: 'shell/completion.zsh',
      },
      shellInit: [
        once /* zsh */`
          echo "once from cargo-quickinstall-tool"
        `,
        always /* zsh */`
          echo "always from cargo-quickinstall-tool"
        `,
      ],
    })
);
