function install--gh() {
  zinit ice from=gh-r as=program \
    mv="gh_*/bin/gh -> gh"

  zinit light cli/cli
}
