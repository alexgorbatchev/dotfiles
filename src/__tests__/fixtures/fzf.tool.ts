import type { ToolConfig } from '@types';
import { always } from '@types'; 

const fzfToolConfig: ToolConfig = {
  name: 'fzf',
  binaries: ['fzf'],
  version: 'latest', // Corresponds to the latest GitHub release from junegunn/fzf
  installationMethod: 'github-release',
  installParams: {
    repo: 'junegunn/fzf',
    // assetPattern, binaryPath, moveBinaryTo can be added if specific assets/paths are needed.
    // For fzf, the default asset selection by the generator should work for most OS/arch.
  },
  completions: {
    zsh: {
      source: 'shell/completion.zsh', // Path relative to the root of the fzf distribution.
      // The generator should handle placing this correctly for Zsh fpath
      // (e.g., as _fzf) or ensuring it's sourced.
    },
  },
  zshInit: [
    always`
      # Unset and set FZF environment variables as per user's 02-configs/fzf/init.zsh
      unset FZF_PREVIEW
      unset FZF_PREVIEW_WINDOW
      unset FZF_DEFAULT_OPTS
      export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"

      # Standard fzf key bindings and completions setup.
      # This assumes the generator installs fzf via 'github-release' into a conventional directory,
      # e.g., "$DOTFILES/.generated/tools/fzf/bin" for binary and "$DOTFILES/.generated/tools/fzf" for other files.
      # The exact path convention should be confirmed with the generator's implementation details.

      _fzf_tool_install_dir="$DOTFILES/.generated/tools/fzf" # Assumed conventional base path for fzf install

      # Source key bindings
      if [ -f "$_fzf_tool_install_dir/shell/key-bindings.zsh" ]; then
        source "$_fzf_tool_install_dir/shell/key-bindings.zsh"
      elif [ -f "\${XDG_CONFIG_HOME:-$HOME/.config}/fzf/shell/key-bindings.zsh" ]; then # Fallback to common user config path
        source "\${XDG_CONFIG_HOME:-$HOME/.config}/fzf/shell/key-bindings.zsh"
      elif [ -f "$HOME/.fzf/shell/key-bindings.zsh" ]; then # Fallback to common ~/.fzf path
        source "$HOME/.fzf/shell/key-bindings.zsh"
      fi

      # Custom ZLE widget: fzf-jump-to-dir (from user's 02-configs/fzf/init.zsh)
      # Requires: rg (ripgrep), eza (or ls/exa if modified), fzf
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
        # region_highlight is part of user's original config.
        # Ensure Zsh setup supports this (e.g., zsh-syntax-highlighting or similar active).
        region_highlight=("P0 100 bold")
        zle accept-line
        local ret=$?
        zle redisplay
        zle reset-prompt
        return $ret
      }
      zle -N fzf-jump-to-dir

      # Keybinding for fzf-jump-to-dir (from user's 02-configs/fzf/init.zsh)
      # Compatible with jeffreytse/zsh-vi-mode if zvm_after_init_commands is available.
      if (( \${+zvm_after_init_commands} )); then
        zvm_after_init_commands+=("bindkey '^]' fzf-jump-to-dir")
      else
        bindkey '^]' fzf-jump-to-dir
      fi
    `,
  ],
  updateCheck: {
    enabled: true,
    // constraint: ">=0.40.0" // Example: if a specific minimum version is ever needed
  },
  // No specific symlinks identified for fzf core config files from user's setup.
  // fzf is primarily configured via environment variables and its shell integration scripts.
};

export default fzfToolConfig;
