function install--hermit() {
  zinit ice from=gh-r as=program \
    mv="hermit* -> hermit"

  zinit light cashapp/hermit
}
