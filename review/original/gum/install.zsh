function install--gum() {
  zinit ice from=gh-r as=program \
    completions="completions/gum.zsh"

  zinit load charmbracelet/gum
}
