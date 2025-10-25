import { always, defineTool, once } from '@dotfiles/schemas';

export default defineTool((c) =>
  c
    .bin('cargo-quickinstall-tool')
    .version('latest')
    .install('cargo', {
      crateName: 'cargo-quickinstall-tool',
      binarySource: 'cargo-quickinstall',
      versionSource: 'cargo-toml',
      githubRepo: 'repo/cargo-quickinstall-tool',
    })
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
