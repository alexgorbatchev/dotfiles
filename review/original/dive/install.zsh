function install--dive() {
  zinit ice from=gh-r as=program
  zinit light wagoodman/dive

  ln-once "$DOTFILES_CONFIGS/dive/dive.yaml" "$HOME/.config/dive/dive.yaml"
}
