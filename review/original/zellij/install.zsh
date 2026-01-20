#
function install--zellij() {
  zinit ice from=gh-r as=program
  zinit light zellij-org/zellij
  ln-once "$DOTFILES_CONFIGS/zellij/config.kdl" "$HOME/.config/zellij/config.kdl"
}
