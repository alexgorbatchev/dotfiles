#!/bin/sh
# Installs the way claude.ai/install.sh does: the binary goes into a versions directory
# the script picks itself, and a launcher symlink in ~/.local/bin points at it. Nothing
# is written to the staging directory, and there is no option to redirect it there.
set -e

: "${MOCK_HOME:?MOCK_HOME must name the home directory to install into}"

versions_dir="$MOCK_HOME/.local/share/curl-script--binary-path/versions"
launcher="$MOCK_HOME/.local/bin/curl-script--binary-path"

mkdir -p "$versions_dir" "$(dirname "$launcher")"

printf '#!/bin/sh\necho "curl-script--binary-path 3.1.4"\n' > "$versions_dir/3.1.4"
chmod +x "$versions_dir/3.1.4"

ln -sfn "$versions_dir/3.1.4" "$launcher"
