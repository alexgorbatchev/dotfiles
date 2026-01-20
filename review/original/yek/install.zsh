function install--yek() {
  zinit ice as=program from=gh-r \
    mv='*-*/* -> yek'

  zinit light bodo-run/yek
}
