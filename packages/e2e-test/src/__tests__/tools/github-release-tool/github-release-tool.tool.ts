import { always, defineTool, once } from '@dotfiles/schemas';

export default defineTool((c) =>
  c
    .bin('github-release-tool')
    .version('latest')
    .install('github-release', {
      repo: 'repo/github-release-tool',
    })
    .zsh({
      environment: {
        GITHUB_RELEASE_TOOL_DEFAULT_OPTS: '--color=fg',
        GITHUB_RELEASE_TOOL_OTHER_OPTS: '--arg=1',
      },
      aliases: {
        grt: 'github-release-tool --preview "ps -f -p {+}"',
      },
      completions: {
        source: 'shell/completion.zsh',
      },
      shellInit: [
        once /* zsh */`
          echo "hello from github-release-tool"
        `,
        always /* zsh */`
          bindkey '^]' github-release-tool-jump-to-dir
        `,
      ],
    })
);
