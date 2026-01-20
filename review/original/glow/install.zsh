function install--glow() {
  zinit ice from=gh-r as=program \
    mv="*/glow -> glow"

  zinit load charmbracelet/glow
}
