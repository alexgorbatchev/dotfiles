function install--git-town() {
  zinit ice from=gh-r as=program \
    completions="*/autocomplete/bat.zsh"

  zinit load git-town/git-town

  eval "$(git-town completions zsh)"
}
