function install--yazi() {
  zinit ice from=gh-r as=program \
    bpick='yazi-*.zip' \
    pick='yazi-*/yazi' \
    multisrc='yazi-*/ya'
  zinit light sxyazi/yazi
}
