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
export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'blacknon/hwatch',
  })
    .bin('hwatch', 'bin/hwatch')
    .bash((shell) => shell.completions('completion/bash/hwatch-completion.bash'))
    .zsh((shell) => shell.completions('completion/zsh/_hwatch'))
);
