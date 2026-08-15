#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures"
INSTALL_SCRIPT="${SCRIPT_DIR}/install.sh"
DIST_DIR="${REPO_ROOT}/.dist"
DIST_PACKAGE_SPEC="file://${DIST_DIR}"

KEEP_WORKDIRS=0
REBUILD_DIST=0

log() {
	printf '[bootstrap-test] %s\n' "$*"
}

fail() {
	printf '[bootstrap-test] %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage:
	 bash scripts/managed-installer/test.sh list
	 bash scripts/managed-installer/test.sh <scenario>
	 bash scripts/managed-installer/test.sh all

Options:
  --keep          Keep temporary scenario workdirs
  --rebuild-dist  Rebuild .dist before running scenarios

Scenarios:
	 fresh-empty
	 existing-package-only
	 existing-config-only
	 existing-project-full
EOF
}

list_scenarios() {
	printf '%s\n' \
		fresh-empty \
		existing-package-only \
		existing-config-only \
		existing-project-full
}

assert_exists() {
	local file_path="$1"
	[[ -e "${file_path}" ]] || fail "Expected file to exist: ${file_path}"
}

assert_not_exists() {
	local file_path="$1"
	[[ ! -e "${file_path}" ]] || fail "Expected file to be absent: ${file_path}"
}

assert_contains() {
	local file_path="$1"
	local expected="$2"
	grep -Fq "${expected}" "${file_path}" || fail "Expected '${expected}' in ${file_path}"
}

assert_not_contains() {
	local file_path="$1"
	local unexpected="$2"
	if grep -Fq "${unexpected}" "${file_path}"; then
		fail "Did not expect '${unexpected}' in ${file_path}"
	fi
}

write_command_stub() {
	local file_path="$1"
	printf '#!/usr/bin/env bash\nexit 0\n' >"${file_path}"
	chmod +x "${file_path}"
}

write_fake_bun_install_stub() {
	local file_path="$1"
	local bun_binary="$2"

	cat >"${file_path}" <<'EOF'
#!/usr/bin/env bash
cat <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${BUN_INSTALL}/bin"
cp "__REAL_BUN_BINARY__" "${BUN_INSTALL}/bin/bun"
chmod +x "${BUN_INSTALL}/bin/bun"
INSTALL
EOF

	chmod +x "${file_path}"
	BUN_BINARY_VALUE="${bun_binary}" perl -0pi -e 's|__REAL_BUN_BINARY__|$ENV{BUN_BINARY_VALUE}|g' "${file_path}"
}

ensure_dist() {
	if [[ "${REBUILD_DIST}" = "1" || ! -x "${DIST_DIR}/dotfiles" ]]; then
		log "Building local distributable in ${DIST_DIR}"
		bun compile
	fi

	[[ -x "${DIST_DIR}/dotfiles" ]] || fail "Missing executable ${DIST_DIR}/dotfiles after build"
}

copy_fixture() {
	local scenario="$1"
	local work_dir="$2"
	local fixture_dir="${FIXTURES_DIR}/${scenario}"

	[[ -d "${fixture_dir}" ]] || fail "Unknown fixture scenario: ${scenario}"
	mkdir -p "${work_dir}"
	cp -R "${fixture_dir}/." "${work_dir}"
	rm -f "${work_dir}/scenario.env" "${work_dir}/README.md" "${work_dir}/.gitkeep"
}

replace_bun_placeholder() {
	local work_dir="$1"
	local bun_binary="$2"
	local bun_tool_path="${work_dir}/tools/bun.tool.ts"

	if [[ -f "${bun_tool_path}" ]]; then
		BUN_BINARY_VALUE="${bun_binary}" perl -0pi -e 's|__BUN_BINARY__|$ENV{BUN_BINARY_VALUE}|g' "${bun_tool_path}"
	fi
}

load_scenario_env() {
	local scenario="$1"
	local env_file="${FIXTURES_DIR}/${scenario}/scenario.env"

	DOTFILES_SKIP_MANAGED_BUN_INSTALL=0
	DOTFILES_PACKAGE_SPEC="${DIST_PACKAGE_SPEC}"

	if [[ -f "${env_file}" ]]; then
		# shellcheck disable=SC1090
		source "${env_file}"
	fi
}

assert_scenario() {
	local scenario="$1"
	local work_dir="$2"
	local output_log="$3"

	assert_exists "${work_dir}/.generated/node_modules/@alexgorbatchev/dotfiles/package.json"
	assert_exists "${work_dir}/.generated/node_modules/@alexgorbatchev/dotfiles/index.d.ts"
	assert_exists "${work_dir}/.generated/tool-types.d.ts"
	assert_exists "${work_dir}/node_modules/@alexgorbatchev/dotfiles"
	assert_contains "${output_log}" "dotfiles bootstrap complete"
	assert_contains "${output_log}" "Generating shims and shell configuration"

	case "${scenario}" in
	fresh-empty)
		assert_exists "${work_dir}/dotfiles.config.ts"
		assert_contains "${output_log}" "No dotfiles config found"
		;;
	existing-package-only | failing-package-postinstall | missing-package-spec)
		assert_exists "${work_dir}/dotfiles.config.ts"
		;;
	existing-config-only)
		assert_exists "${work_dir}/dotfiles.config.ts"
		assert_contains "${work_dir}/dotfiles.config.ts" "fixture-marker: existing-config-only"
		assert_contains "${output_log}" "Found dotfiles config"
		;;
	existing-project-full | existing-project-full-temp-bun)
		assert_exists "${work_dir}/dotfiles.config.ts"
		;;
	*)
		fail "Unknown scenario assertions: ${scenario}"
		;;
	esac
}

run_scenario() {
	local scenario="$1"

	local temp_root
	temp_root="$(mktemp -d "${TMPDIR:-/tmp}/bootstrap-install-test.${scenario}.XXXXXX")"
	local work_dir="${temp_root}/workspace"
	local output_log="${temp_root}/install.log"
	local bun_binary
	bun_binary="$(command -v bun)"

	log "Preparing scenario '${scenario}' in ${work_dir}"
	copy_fixture "${scenario}" "${work_dir}"
	replace_bun_placeholder "${work_dir}" "${bun_binary}"
	load_scenario_env "${scenario}"

	(
		cd "${work_dir}"
		DOTFILES_YES=1 \
			DOTFILES_BINARY_PATH="${DIST_DIR}/dotfiles" \
			bash "${INSTALL_SCRIPT}"
	) | tee "${output_log}"

	assert_scenario "${scenario}" "${work_dir}" "${output_log}"
	log "Scenario '${scenario}' passed"

	if [[ "${KEEP_WORKDIRS}" = "1" ]]; then
		log "Kept workdir: ${work_dir}"
	else
		rm -rf "${temp_root}"
	fi
}

main() {
	if [[ $# -eq 0 ]]; then
		usage
		exit 1
	fi

	local scenario=""

	while [[ $# -gt 0 ]]; do
		case "$1" in
		--keep)
			KEEP_WORKDIRS=1
			;;
		--rebuild-dist)
			REBUILD_DIST=1
			;;
		list)
			list_scenarios
			return 0
			;;
		all | fresh-empty | existing-package-only | existing-config-only | existing-project-full)
			if [[ -n "${scenario}" ]]; then
				fail "Only one scenario argument is allowed"
			fi
			scenario="$1"
			;;
		--help | -h)
			usage
			return 0
			;;
		*)
			fail "Unknown argument: $1"
			;;
		esac
		shift
	done

	[[ -n "${scenario}" ]] || fail "Missing scenario argument"
	if [[ "${scenario}" != "missing-unzip" ]]; then
		command -v bun >/dev/null 2>&1 || fail "bun must be available on PATH to run the test harness"
		ensure_dist
	fi

	if [[ "${scenario}" = "all" ]]; then
		while IFS= read -r scenario_name; do
			run_scenario "${scenario_name}"
		done < <(list_scenarios)
		return 0
	fi

	run_scenario "${scenario}"
}

main "$@"
