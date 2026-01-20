function install--jq() {
  zinit ice from=gh-r as=program \
    mv="jq-* -> jq"

  zinit light jqlang/jq

  # Interactively build jq expressions
  # https://github.com/reegnz/jq-zsh-plugin
  zinit light reegnz/jq-zsh-plugin
}
