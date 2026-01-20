function install--chatgpt() {
  zinit ice as=program from=gh-r \
    atclone="chmod +x *" \
    mv="chatgpt-* -> chatgpt"

  zinit light kardolus/chatgpt-cli
}
