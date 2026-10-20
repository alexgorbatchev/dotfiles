#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
just --justfile ./Justfile setup
just --justfile ./Justfile setup
just --justfile ./Justfile run --help >/dev/null
