import { defineTool } from '@dotfiles/cli';

/**
 * zsh-vi-mode - A better and friendly vi(vim) mode plugin for ZSH.
 *
 * https://github.com/jeffreytse/zsh-vi-mode
 */
export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) =>
      shell
        .environment({
          ZVM_VI_INSERT_ESCAPE_BINDKEY: 'jj',
          ZVM_CURSOR_STYLE_ENABLED: 'false',
        })
        .always(/* zsh */ `
          # Source zsh-vi-mode plugin
          source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"
        `)
    )
);
