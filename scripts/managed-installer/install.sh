#!/usr/bin/env bash

set -euo pipefail

TEMP_DIR=""
INSTALL_DIR="${INSTALL_DIR:-$PWD}"
DOTFILES_VERSION="${DOTFILES_VERSION:-latest}"
DOTFILES_TARGET_DIR="${DOTFILES_TARGET_DIR:-$INSTALL_DIR/.generated/bin}"
DOTFILES_BINARY_PATH="${DOTFILES_BINARY_PATH:-}"
DOTFILES_BASE_URL="${DOTFILES_BASE_URL:-https://github.com/alexgorbatchev/dotfiles}"
DOTFILES_YES="${DOTFILES_YES:-0}"
CONFIG_PATH="${INSTALL_DIR}/dotfiles.config.ts"
TOOLS_DIR="${INSTALL_DIR}/tools"
CONFIG_EXISTS="0"

get_term_width() {
	local cols=0
	if [[ -e /dev/tty && -c /dev/tty ]]; then
		cols="$((stty size 2>/dev/null </dev/tty) 2>/dev/null | awk '{print $2}')"
		if [[ -z "${cols}" || "${cols}" -eq 0 ]]; then
			cols="$((tput cols 2>/dev/null </dev/tty) 2>/dev/null || echo 0)"
		fi
	fi
	if [[ -z "${cols}" || "${cols}" -eq 0 ]] && command -v tput >/dev/null 2>&1; then
		cols="$(tput cols 2>/dev/null || echo 0)"
	fi
	if [[ -z "${cols}" || "${cols}" -eq 0 ]] && [[ -n "${COLUMNS:-}" ]]; then
		cols="${COLUMNS}"
	fi
	if [[ ! "${cols}" =~ ^[0-9]+$ ]] || [[ "${cols}" -lt 20 ]]; then
		cols=80
	fi
	echo "${cols}"
}

print_rule() {
	local width
	width="$(get_term_width)"
	printf '%*s\n' "${width}" '' | tr ' ' '='
}

log() {
	printf '[dotfiles-install] %s\n' "$*"
}

format_path() {
	local p="$1"
	if [[ -n "${HOME:-}" && "${p}" == "${HOME}"* ]]; then
		echo "~${p#"${HOME}"}"
	else
		echo "${p}"
	fi
}

fail() {
	printf '[dotfiles-install] %s\n' "$*" >&2
	exit 1
}

cleanup() {
	local exit_code="$1"

	if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
		rm -rf "${TEMP_DIR}"
	fi

	return "${exit_code}"
}

trap 'cleanup $?' EXIT

confirm_installation() {
	if [[ "${DOTFILES_YES}" = "1" ]]; then
		log "Skipping confirmation prompt because DOTFILES_YES=1"
		return 0
	fi

	if [[ ! -r /dev/tty ]]; then
		fail "Confirmation required but /dev/tty is not available. Re-run with DOTFILES_YES=1 to skip the prompt."
	fi

	printf '[dotfiles-install] Install dotfiles into the current directory?\n' >/dev/tty
	printf '[dotfiles-install] Directory: %s\n' "$(format_path "${INSTALL_DIR}")" >/dev/tty
	printf '[dotfiles-install] Proceed? [y/N] ' >/dev/tty

	local response
	IFS= read -r response </dev/tty
	case "${response}" in
	y | Y | yes | YES)
		return 0
		;;
	*)
		fail "Installation cancelled"
		;;
	esac
}

write_default_config() {
	mkdir -p "${TOOLS_DIR}"

	if [[ ! -f "${INSTALL_DIR}/package.json" ]]; then
		cat >"${INSTALL_DIR}/package.json" <<'EOF'
{
  "private": true,
  "type": "module"
}
EOF
	fi

	if [[ ! -f "${INSTALL_DIR}/tsconfig.json" ]]; then
		cat >"${INSTALL_DIR}/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": [
      "ESNext"
    ]
  },
  "include": [
    "dotfiles.config.ts",
    "tools/**/*.ts"
  ]
}
EOF
	fi

	if [[ ! -f "${TOOLS_DIR}/dotfiles.tool.ts" ]]; then
		cat >"${TOOLS_DIR}/dotfiles.tool.ts" <<'EOF'
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "alexgorbatchev/dotfiles" })
    .bin("dotfiles")
);
EOF
	fi

	cat >"${CONFIG_PATH}" <<EOF
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: \`\${configFileDir}/tools\`,
    generatedDir: \`\${configFileDir}/.generated\`,
    targetDir: "${DOTFILES_TARGET_DIR}",
  },
}));
EOF
}

detect_os_arch() {
	local os arch
	os="$(uname -s | tr '[:upper:]' '[:lower:]')"
	arch="$(uname -m)"

	case "${os}" in
	darwin | linux) ;;
	*) fail "Unsupported OS: ${os}" ;;
	esac

	case "${arch}" in
	x86_64 | amd64 | x64) arch="amd64" ;;
	aarch64 | arm64) arch="arm64" ;;
	*) fail "Unsupported architecture: ${arch}" ;;
	esac

	echo "${os}_${arch}"
}

ensure_dotfiles_binary() {
	if [[ -n "${DOTFILES_BINARY_PATH}" && -x "${DOTFILES_BINARY_PATH}" ]]; then
		log "Using specified dotfiles binary: $(format_path "${DOTFILES_BINARY_PATH}")"
		DOTFILES_BIN="${DOTFILES_BINARY_PATH}"
		return 0
	fi

	TEMP_DIR="$(mktemp -d)"
	local temp_bin="${TEMP_DIR}/dotfiles"

	local target_plat
	target_plat="$(detect_os_arch)"

	if [[ "${DOTFILES_VERSION}" = "latest" ]]; then
		local latest_tag
		latest_tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${DOTFILES_BASE_URL}/releases/latest" 2>/dev/null | sed 's#.*/v##' | sed 's#.*/##')"
		if [[ -n "${latest_tag}" && "${latest_tag}" != "latest" ]]; then
			DOTFILES_VERSION="${latest_tag#v}"
		else
			fail "Failed to resolve latest release version from ${DOTFILES_BASE_URL}"
		fi
	fi

	local archive_name="dotfiles_${DOTFILES_VERSION}_${target_plat}.tar.gz"
	local download_url="${DOTFILES_BASE_URL}/releases/download/v${DOTFILES_VERSION}/${archive_name}"

	log "Downloading temporary bootstrap binary from ${download_url}"
	command -v curl >/dev/null 2>&1 || fail "curl is required to download dotfiles release archive"
	command -v tar >/dev/null 2>&1 || fail "tar is required to extract dotfiles release archive"

	local temp_tar="${TEMP_DIR}/${archive_name}"

	curl -fsSL "${download_url}" -o "${temp_tar}"
	tar -xzf "${temp_tar}" -C "${TEMP_DIR}" dotfiles
	chmod +x "${temp_bin}"

	DOTFILES_BIN="${temp_bin}"
}

if [[ -f "${CONFIG_PATH}" ]]; then
	CONFIG_EXISTS="1"
	log "Found dotfiles config: $(format_path "${CONFIG_PATH}")"
else
	log "No dotfiles config found in $(format_path "${INSTALL_DIR}"). A new dotfiles.config.ts will be created."
fi

confirm_installation

ensure_dotfiles_binary

if [[ "${CONFIG_EXISTS}" != "1" ]]; then
	log "Creating $(format_path "${CONFIG_PATH}")"
	write_default_config
fi

log "Generating shims and shell configuration"
"${DOTFILES_BIN}" --config "${CONFIG_PATH}" generate

log "dotfiles bootstrap complete!"

user_shell="$(basename "${SHELL:-zsh}")"
shell_ext="zsh"
shell_rc="~/.zshrc"

case "${user_shell}" in
bash)
	shell_ext="bash"
	shell_rc="~/.bashrc"
	;;
pwsh | powershell)
	shell_ext="ps1"
	shell_rc="PowerShell profile"
	;;
*)
	shell_ext="zsh"
	shell_rc="~/.zshrc"
	;;
esac

script_path="$(format_path "${INSTALL_DIR}/.generated/shell-scripts/main.${shell_ext}")"

printf '\n'
print_rule
printf ' 🎉 Next Step: Connect dotfiles to your shell\n'
print_rule
printf '\n'
printf '  Add the following line to your %s:\n\n' "${shell_rc}"
printf '    source "%s"\n\n' "${script_path}"
printf '  Or load it directly into your current terminal session now:\n\n'
printf '    source "%s"\n\n' "${script_path}"
print_rule
printf '\n'
