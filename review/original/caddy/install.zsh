function install--caddy() {
  zinit ice from=gh-r as=program \
    bpick='caddy_*.tar.gz'

  zinit load caddyserver/caddy
}
