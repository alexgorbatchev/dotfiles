#
# https://github.com/denisidoro/navi
#
export NAVI_CONFIG="$DOTFILES_CONFIGS/navi/config.yaml"

function setup_navi() {
  local init_file="$DOTFILES_CONFIGS/navi/navi-init"

  # Need to eval the widget to get the keybindings working with jeffreytse/zsh-vi-mode
  [ -f "$init_file" ] && zvm_after_init_commands+=("source '$init_file'")

  unset -f setup_navi
}

setup_navi
alias-installer navi
