function install--spf() {
  zinit ice from=gh-r as=program \
    mv='**/spf -> spf'

  zinit light yorukot/superfile
}
