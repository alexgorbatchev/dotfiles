function install--borders() {
  if ! is-osx; then
    echo "This is MacOS only"
  else
    brew tap FelixKratz/formulae
    brew install borders
    ln-once "$DOTFILES_CONFIGS/borders/bordersrc" "$HOME/.config/borders/bordersrc"
  fi
}
