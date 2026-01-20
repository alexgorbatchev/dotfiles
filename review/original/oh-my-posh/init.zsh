#
# https://github.com/JanDeDobbeleer/oh-my-posh
#

function setup-oh-my-posh() {
  local config_kind
  local config_file
  local init_file
  local dir="$DOTFILES_CONFIGS/oh-my-posh"
  
  export DOTFILES_OH_MY_POSH_DIR="$dir"

  zinit ice as=program from=gh-r \
    mv="posh-* -> oh-my-posh"
  zinit light JanDeDobbeleer/oh-my-posh

  # if [ -n "$MYVIMRC" ] || [ "$TERM_PROGRAM" = "vscode" ]; then
  #   config_kind="minimal"
  # else
  #   config_kind="default"
  # fi
  config_kind="default"

  config_file="$dir/config/$config_kind.yaml"
  init_file="$dir/oh-my-posh-init-$config_kind"

  if [ ! -f "$init_file" ]; then
    oh-my-posh init zsh --config "$config_file" >"$init_file"
  fi

  source "$init_file"
  unset -f setup-oh-my-posh
}

setup-oh-my-posh
