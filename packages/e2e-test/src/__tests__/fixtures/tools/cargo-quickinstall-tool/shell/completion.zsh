# cargo-quickinstall-tool completion for zsh
#compdef cargo-quickinstall-tool

_cargo-quickinstall-tool() {
  _arguments \
    '1:command:(run test build)' \
    '*::args:->args'
}

_cargo-quickinstall-tool "$@"
