function install--mods() {
  zinit ice from=gh-r as=program \
    mv="*/mods -> mods"

  zinit load charmbracelet/mods

  ln-once "$DOTFILES_CONFIGS/mods/config.yaml" "$HOME/.config/mods/mods.yml"
}
