unset FZF_PREVIEW
unset FZF_PREVIEW_WINDOW
unset FZF_DEFAULT_OPTS
export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"

zinit ice from=gh-r as=program
zinit light junegunn/fzf

# Function to CD into any directory in the CWD and down
function fzf-jump-to-dir() {
  local dir
  dir=$(
    rg --files --null |
      xargs -0 dirname |
      sort -u |
      fzf --preview 'eza -la --color=always {}' \
        --preview-window=up \
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

# Create a ZLE widget from the function
zle -N fzf-jump-to-dir

# Need to eval the widget to get the keybindings working with jeffreytse/zsh-vi-mode
zvm_after_init_commands+=("bindkey '^]' fzf-jump-to-dir")
