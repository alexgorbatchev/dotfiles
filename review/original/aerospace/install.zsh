function install--aerospace() {
  if ! is-osx; then
    echo "Aerospace is for MacOS only"
    return 1
  else
    brew install --cask nikitabobko/tap/aerospace
    ln-once "$DOTFILES_CONFIGS/aerospace/aerospace.toml" "$HOME/.config/aerospace/aerospace.toml"
  fi
}
