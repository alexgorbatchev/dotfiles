import { defineTool } from '@gitea/dotfiles';

/**
 * hwatch - An alternative to the watch command that records execution results
 * and can display history and diffs.
 *
 * Features: History recording, multiple diff modes (watch/line/word),
 * JSON logging, custom keymaps, ANSI color support, scrollable results.
 *
 * https://github.com/blacknon/hwatch
 */
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'blacknon/hwatch',
  })
    .bin('hwatch', 'bin/hwatch')
    .bash((shell) => shell.completions(`${ctx.currentDir}/completion/bash/hwatch-completion.bash`))
    .zsh((shell) => shell.completions(`${ctx.currentDir}/completion/zsh/_hwatch`))
);
