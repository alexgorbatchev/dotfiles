function install--bat() {
  zinit ice from=gh-r as=program \
    completions="*/autocomplete/bat.zsh" \
    mv="*/bat -> bat"

  zinit load sharkdp/bat
}
