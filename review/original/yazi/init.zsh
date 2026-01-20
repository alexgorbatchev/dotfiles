#
# Blazing fast terminal file manager written in Rust, based on async I/O.
# https://github.com/sxyazi/yazi
#

export YAZI_CONFIG_HOME="$DOTFILES_CONFIGS/yazi/config"

alias-installer yazi

# Will CD into the last directory you were in when yazi exits
function y() {
  local tmp="$(mktemp -t "yazi-cwd.XXXXXX")"
  yazi --cwd-file="$tmp"
  if cwd="$(cat -- "$tmp")" && [ -d "$cwd" ]; then
    cd "$cwd"
  fi
  rm -f -- "$tmp"
}
