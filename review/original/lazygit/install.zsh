function install--lazygit() {
  zinit ice from=gh-r as=program
  zinit light jesseduffield/lazygit
  ln-once "$DOTFILES_CONFIGS/lazygit/config.yml" "$HOME/.config/lazygit/config.yml"
}
