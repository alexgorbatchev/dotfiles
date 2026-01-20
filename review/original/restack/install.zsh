function install--restack() {
  zinit ice from=gh-r as=program
  #mv='restack -> git-restack'
  zinit light abhinav/restack
}
