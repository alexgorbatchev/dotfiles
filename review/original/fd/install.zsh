function install--fd() {
  zinit ice from=gh-r as=program \
    mv="fd*/fd -> fd"

  zinit light sharkdp/fd
}
