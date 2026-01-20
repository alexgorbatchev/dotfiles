function install--eza() {
  if is-osx; then
    function setup_eza() {
      local version="$(curl -s \"https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml\" | fq '. | tojson | fromjson' | jq -r '.package.version')"
      local repo="https://github.com/cargo-bins/cargo-quickinstall"
      local url="$repo/releases/download/eza-${version}/eza-${version}-aarch64-apple-darwin.tar.gz"

      echo "Installing eza v${version}..."
      curl -sL "$url" | tar xz -C "$LOCAL_BIN"
      unset -f setup_eza
    }

    setup_eza
  else
    zinit ice from=gh-r as=program \
      completions="completions/zsh/_eza"

    zinit load eza-community/eza
  fi
}
