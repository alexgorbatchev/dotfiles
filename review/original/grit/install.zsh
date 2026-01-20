function install--grit() {
  zinit ice as=program from=gh-r \
    mv='*-*/* -> grit'

  zinit light getgrit/gritql
}
