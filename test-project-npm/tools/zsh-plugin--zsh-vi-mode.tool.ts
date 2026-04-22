import { defineTool } from "@dotfiles/cli";

/**
 * zsh-vi-mode - A better and friendly vi(vim) mode plugin for ZSH.
 *
 * https://github.com/jeffreytse/zsh-vi-mode
 *
 * The plugin is automatically sourced by the installer.
 * Environment variables are set before the plugin is sourced.
 */
export default defineTool((install) =>
  install("zsh-plugin", {
    repo: "jeffreytse/zsh-vi-mode",
    auto: true,
  }).zsh((shell) =>
    shell.env({
      ZVM_VI_INSERT_ESCAPE_BINDKEY: "jj",
      ZVM_CURSOR_STYLE_ENABLED: "false",
    }),
  ),
);
