#
# SSH setup somewhat based on
# https://gist.github.com/adojos/5aab5e1dcedc16957c465be0212ea099
#

function ssh_configure() {
  local ssh_dir="$HOME/.ssh"
  local config_file="$ssh_dir/config"
  local cur_dir="$DOTFILES_CONFIGS/ssh"
  local include_path="$cur_dir/config"
  local agent_env="$ssh_dir/agent_env"
  local id_rsa="$ssh_dir/id_rsa"

  # Check if ~/.ssh directory exists
  [ ! -d "$ssh_dir" ] && mkdir -p "$ssh_dir"

  function ssh_symlink() {
    local target=$1
    local symlink=$2

    echo "Symlinking [$target] to [$symlink]"
    rm -fr $symlink
    ln -s "$target" "$symlink"

    chmod 600 "$symlink"
  }

  function ssh_add_known_host() {
    local host=$1
    local known_hosts="$HOME/.ssh/known_hosts"

    echo "Adding [$host] to [$known_hosts]"
    touch "$known_hosts"

    if ! grep -q "$host" "$known_hosts"; then
      ssh-keyscan -H "$host" 2>/dev/null >>"$known_hosts"
    fi
  }

  # Use id_rsa as a test if .ssh files are configured
  if [ ! -f "$id_rsa" ]; then
    # Symlink id_rsa into ~/.ssh directory
    ssh_symlink "$cur_dir/id_rsa" "$id_rsa"
    ssh_symlink "$cur_dir/id_rsa.pub" "$id_rsa.pub"

    # Add known hosts
    ssh_add_known_host "git-ssh.example.com"
    ssh_add_known_host "github.com"

    # Check if the include line already exists
    grep -qF "Include $include_path" "$config_file" 2>/dev/null

    # If not found, append it to the file
    if [ $? -ne 0 ]; then
      echo "Include $include_path" >>"$config_file"
      echo "Added include [$include_path] to $config_file"
      echo "Don't forget to run ssh-add"
    fi
  fi

  function ssh_start_agent() {
    ssh-agent -s >"$agent_env"
    source "$agent_env" >/dev/null
    echo "ssh-agent started"
  }

  if [ -f "$agent_env" ]; then
    source "$agent_env" >/dev/null

    # Check if the agent is still running
    if ! kill -0 $SSH_AGENT_PID 2>/dev/null; then
      echo "Stale ssh-agent found, restarting"
      ssh_start_agent
    fi
  else
    # Start a new agent if no env file exists
    ssh_start_agent
  fi

  unset -f ssh_configure
}

ssh_configure
