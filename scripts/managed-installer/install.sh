#!/usr/bin/env bash

set -euo pipefail

DOTFILES_PACKAGE_SPEC="${DOTFILES_PACKAGE_SPEC:-@alexgorbatchev/dotfiles}"
DOTFILES_BUN_TOOL="${DOTFILES_BUN_TOOL:-bun}"
DOTFILES_SKIP_MANAGED_BUN_INSTALL="${DOTFILES_SKIP_MANAGED_BUN_INSTALL:-0}"
DOTFILES_YES="${DOTFILES_YES:-0}"

TEMP_DIR=""
TEMP_BUN_INSTALL=""
INSTALL_DIR="${PWD}"
CONFIG_PATH="${INSTALL_DIR}/dotfiles.config.ts"
PACKAGE_JSON_PATH="${INSTALL_DIR}/package.json"
TOOLS_DIR="${INSTALL_DIR}/tools"
BUN_TOOL_PATH="${TOOLS_DIR}/bun.tool.ts"
CONFIG_EXISTS="0"
PACKAGE_JSON_EXISTS="0"

log() {
	printf '[dotfiles-install] %s\n' "$*"
}

fail() {
	printf '[dotfiles-install] %s\n' "$*" >&2
	exit 1
}

cleanup() {
	if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
		rm -rf "${TEMP_DIR}"
	fi
}

ensure_bun_bootstrap_requirements() {
	if command -v bun >/dev/null 2>&1; then
		return 0
	fi

	command -v curl >/dev/null 2>&1 || fail "curl is required to bootstrap Bun"
	command -v unzip >/dev/null 2>&1 || fail "unzip is required to bootstrap Bun"
}

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

	cat >"${CONFIG_PATH}" <<'EOF'
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: `${configFileDir}/tools`,
    generatedDir: `${configFileDir}/.generated`,
    targetDir: "~/.local/bin",
  },
}));
EOF
}

write_default_bun_tool() {
	mkdir -p "${TOOLS_DIR}"

	cat >"${BUN_TOOL_PATH}" <<'EOF'
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", {
    repo: "oven-sh/bun",
  }).bin("bun"),
);
EOF
}

trap cleanup EXIT

ensure_bun_bootstrap_requirements

if [[ -f "${CONFIG_PATH}" ]]; then
	CONFIG_EXISTS="1"
	log "Found dotfiles config: ${CONFIG_PATH}"
else
	log "No dotfiles config found in ${INSTALL_DIR}. A new dotfiles.config.ts will be created."
fi

if [[ -f "${PACKAGE_JSON_PATH}" ]]; then
	PACKAGE_JSON_EXISTS="1"
	log "Found package.json: ${PACKAGE_JSON_PATH}"
else
	log "No package.json found in ${INSTALL_DIR}. A new package.json will be initialized."
fi

confirm_installation

if command -v bun >/dev/null 2>&1; then
	BUN_BIN="$(command -v bun)"
	log "Using Bun from PATH: ${BUN_BIN}"
else
	command -v curl >/dev/null 2>&1 || fail "curl is required to bootstrap Bun"
	command -v unzip >/dev/null 2>&1 || fail "unzip is required to bootstrap Bun"

	TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dotfiles-install.XXXXXX")"
	TEMP_BUN_INSTALL="${TEMP_DIR}/bun"

	export BUN_INSTALL="${TEMP_BUN_INSTALL}"
	export PATH="${TEMP_BUN_INSTALL}/bin:${PATH}"

	log "Installing temporary Bun into ${TEMP_BUN_INSTALL}"
	curl -fsSL https://bun.com/install | bash >/dev/null

	BUN_BIN="${TEMP_BUN_INSTALL}/bin/bun"
	[[ -x "${BUN_BIN}" ]] || fail "Temporary Bun installation failed"
fi

if [[ "${PACKAGE_JSON_EXISTS}" != "1" ]]; then
	log "Initializing package.json with bun init --yes --minimal"
	"${BUN_BIN}" init --yes --minimal "${INSTALL_DIR}"
	[[ -f "${PACKAGE_JSON_PATH}" ]] || fail "bun init did not create ${PACKAGE_JSON_PATH}"
fi

log "Installing ${DOTFILES_PACKAGE_SPEC} into ${PACKAGE_JSON_PATH}"
"${BUN_BIN}" add "${DOTFILES_PACKAGE_SPEC}"

if [[ "${CONFIG_EXISTS}" != "1" ]]; then
	log "Creating ${CONFIG_PATH}"
	write_default_config

	if [[ ! -f "${BUN_TOOL_PATH}" ]]; then
		log "Creating ${BUN_TOOL_PATH}"
		write_default_bun_tool
	fi
fi

DOTFILES_BIN="${INSTALL_DIR}/node_modules/.bin/dotfiles"

[[ -x "${DOTFILES_BIN}" ]] || fail "dotfiles binary not found at ${DOTFILES_BIN}"

if [[ "${DOTFILES_SKIP_MANAGED_BUN_INSTALL}" != "1" ]]; then
	log "Installing managed Bun tool '${DOTFILES_BUN_TOOL}' using ${CONFIG_PATH}"
	"${BUN_BIN}" "${DOTFILES_BIN}" --config "${CONFIG_PATH}" install "${DOTFILES_BUN_TOOL}"

	MANAGED_BUN_PATH="$({ "${BUN_BIN}" "${DOTFILES_BIN}" --config "${CONFIG_PATH}" bin "${DOTFILES_BUN_TOOL}" 2>/dev/null || true; })"
	if [[ -n "${MANAGED_BUN_PATH}" ]]; then
		log "Managed Bun installed at ${MANAGED_BUN_PATH}"
	fi
fi

log "Generating shims and shell configuration"
"${BUN_BIN}" "${DOTFILES_BIN}" --config "${CONFIG_PATH}" generate

if [[ -n "${TEMP_DIR}" ]]; then
	log "Removing temporary Bun from ${TEMP_BUN_INSTALL}"
fi

log "dotfiles bootstrap complete"
