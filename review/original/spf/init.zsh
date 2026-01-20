#
# Pretty fancy and modern terminal file manager.
# https://github.com/yorukot/superfile
#

alias s="spf-cd-on-quit"
alias-installer spf

# https://superfile.netlify.app/configure/superfile-config/
function spf-cd-on-quit() {
  local os=$(uname -s)

  # Linux
  if [[ "$os" == "Linux" ]]; then
    export SPF_LAST_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/superfile/lastdir"
  fi

  # macOS
  if [[ "$os" == "Darwin" ]]; then
    export SPF_LAST_DIR="$HOME/Library/Application Support/superfile/lastdir"
  fi

  spf "$@"

  [ ! -f "$SPF_LAST_DIR" ] || {
    . "$SPF_LAST_DIR"
    rm -f -- "$SPF_LAST_DIR" >/dev/null
  }
}
