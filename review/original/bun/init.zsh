#
# Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one
# https://github.com/oven-sh/bun
#
export BUN_INSTALL="$HOME/.bun"
add-to-path "$BUN_INSTALL/bin"

alias-installer bun

# completions
[ -s "$BUN_INSTALL/_bun" ] && source "$BUN_INSTALL/_bun"

alias br="bun run"
alias brw="bun run --watch"
alias bt="bun test"
alias btw="bun test --watch"

function brf() {
  local file
  file=$(fzf-typescript '*.ts' '*.tsx')
  [ -n "$file" ] && br "$file"
}

function brwf() {
  local file
  file=$(fzf-typescript '*.ts' '*.tsx')
  [ -n "$file" ] && brw "$file"
}

function btf() {
  local file
  file=$(fzf-typescript '*.test.ts' '*.test.tsx')
  [ -n "$file" ] && btw "$file"
}

function btwf() {
  local file
  file=$(fzf-typescript '*.test.ts' '*.test.tsx')
  [ -n "$file" ] && btw "$file"
}

function fzf-typescript() {
  local opts
  opts=$(printf -- "-name '%s' -o " "$@" | sed 's/ -o $//')
  eval "find . -type f \\( $opts \\) -not -path '*/node_modules/*'" | fzf --multi --preview 'cat {}' --preview-window='right:60%:wrap'
}
