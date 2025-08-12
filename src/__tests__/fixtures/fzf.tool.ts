import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { always } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('fzf')
    .version('latest')
    .install('github-release', {
      repo: 'junegunn/fzf',
    })
    .completions({
      zsh: { source: 'shell/completion.zsh' },
    })
    .zsh({
      shellInit: [
        always`
          # Unset and set FZF environment variables as per user's 02-configs/fzf/init.zsh
          unset FZF_PREVIEW
          unset FZF_PREVIEW_WINDOW
          unset FZF_DEFAULT_OPTS
          export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"

          # Standard fzf key bindings and completions setup.
          _fzf_tool_install_dir="${ctx.toolDir}"

          # Source key bindings
          if [ -f "$_fzf_tool_install_dir/shell/key-bindings.zsh" ]; then
            source "$_fzf_tool_install_dir/shell/key-bindings.zsh"
          elif [ -f "\${XDG_CONFIG_HOME:-$HOME/.config}/fzf/shell/key-bindings.zsh" ]; then
            source "\${XDG_CONFIG_HOME:-$HOME/.config}/fzf/shell/key-bindings.zsh"
          elif [ -f "$HOME/.fzf/shell/key-bindings.zsh" ]; then
            source "$HOME/.fzf/shell/key-bindings.zsh"
          fi

          # Custom ZLE widget: fzf-jump-to-dir
          function fzf-jump-to-dir() {
            local dir
            dir=$(
              command rg --files --null 2>/dev/null | \\
                command xargs -0 dirname 2>/dev/null | \\
                command sort -u 2>/dev/null | \\
                command fzf --preview 'command eza -la --color=always {}' \\
                  --preview-window=up \\
                  --bind 'esc:abort'
            )

            if [[ -z "$dir" ]]; then
              zle redisplay
              return 0
            fi

            zle kill-whole-line
            BUFFER="builtin cd -- $dir"
            region_highlight=("P0 100 bold")
            zle accept-line
            local ret=$?
            zle redisplay
            zle reset-prompt
            return $ret
          }
          zle -N fzf-jump-to-dir

          # Keybinding for fzf-jump-to-dir
          if (( \${+zvm_after_init_commands} )); then
            zvm_after_init_commands+=("bindkey '^]' fzf-jump-to-dir")
          else
            bindkey '^]' fzf-jump-to-dir
          fi
        `,
      ],
    });
};
