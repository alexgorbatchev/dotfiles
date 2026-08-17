#!/usr/bin/env bash

set -euo pipefail

DOTFILES_VERSION="${DOTFILES_VERSION:-latest}"
DOTFILES_TARGET_DIR="${DOTFILES_TARGET_DIR:-$HOME/.local/bin}"
DOTFILES_BINARY_PATH="${DOTFILES_BINARY_PATH:-}"
DOTFILES_BASE_URL="${DOTFILES_BASE_URL:-https://github.com/alexgorbatchev/dotfiles}"
DOTFILES_YES="${DOTFILES_YES:-0}"

TEMP_DIR=""
INSTALL_DIR="${INSTALL_DIR:-$PWD}"
CONFIG_PATH="${INSTALL_DIR}/dotfiles.config.ts"
TOOLS_DIR="${INSTALL_DIR}/tools"
CONFIG_EXISTS="0"

log() {
	printf '[dotfiles-install] %s\n' "$*"
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
	printf '[dotfiles-install] Directory: %s\n' "${INSTALL_DIR}" >/dev/tty
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
	x86_64 | amd64) arch="amd64" ;;
	aarch64 | arm64) arch="arm64" ;;
	*) fail "Unsupported architecture: ${arch}" ;;
	esac

	echo "${os}-${arch}"
}

ensure_dotfiles_binary() {
	if [[ -n "${DOTFILES_BINARY_PATH}" && -x "${DOTFILES_BINARY_PATH}" ]]; then
		log "Using specified dotfiles binary: ${DOTFILES_BINARY_PATH}"
		DOTFILES_BIN="${DOTFILES_BINARY_PATH}"
		return 0
	fi

	local target_bin="${DOTFILES_TARGET_DIR}/dotfiles"
	mkdir -p "${DOTFILES_TARGET_DIR}"

	local target_plat
	target_plat="$(detect_os_arch)"

	local download_url
	if [[ "${DOTFILES_VERSION}" = "latest" ]]; then
		download_url="${DOTFILES_BASE_URL}/releases/latest/download/dotfiles-${target_plat}"
	else
		download_url="${DOTFILES_BASE_URL}/releases/download/v${DOTFILES_VERSION}/dotfiles-${target_plat}"
	fi

	log "Downloading dotfiles binary (${target_plat}) from ${download_url} to ${target_bin}"
	command -v curl >/dev/null 2>&1 || fail "curl is required to download dotfiles binary"
	curl -fsSL "${download_url}" -o "${target_bin}"
	chmod +x "${target_bin}"

	DOTFILES_BIN="${target_bin}"
}

if [[ -f "${CONFIG_PATH}" ]]; then
	CONFIG_EXISTS="1"
	log "Found dotfiles config: ${CONFIG_PATH}"
else
	log "No dotfiles config found in ${INSTALL_DIR}. A new dotfiles.config.ts will be created."
fi

confirm_installation

ensure_dotfiles_binary

if [[ "${CONFIG_EXISTS}" != "1" ]]; then
	log "Creating ${CONFIG_PATH}"
	write_default_config
fi

log "Generating shims and shell configuration"
"${DOTFILES_BIN}" --config "${CONFIG_PATH}" generate

log "dotfiles bootstrap complete"
