#!/usr/bin/env zsh

# Fast subapp name extraction for oh-my-posh
# Exits immediately if not in a subapp directory

# Use POSH_PWD if available (set by oh-my-posh), otherwise fall back to PWD
current_dir="${POSH_PWD:-$PWD}"

[[ "$current_dir" == *"/subapps/sqc-subapp-"* ]] || exit 0

# Extract subapp name using parameter expansion (faster than external commands)
subapp_path="${current_dir#*subapps/sqc-subapp-}"
subapp_name="${subapp_path%%/*}"

printf "%s" "$subapp_name"
