#!/usr/bin/env bash
set -euo pipefail

# Run all package tests except dashboard client (which needs DOM preloads)
packages=(
  packages/arch
  packages/archive-extractor
  packages/build
  packages/cli
  packages/config
  packages/core
  packages/downloader
  packages/e2e-test
  packages/features
  packages/file-system
  packages/generator-orchestrator
  packages/http-proxy
  packages/installer
  packages/installer-brew
  packages/installer-cargo
  packages/installer-curl-script
  packages/installer-curl-tar
  packages/installer-github
  packages/installer-manual
  packages/installer-zsh-plugin
  packages/logger
  packages/registry
  packages/registry-database
  packages/shell-emissions
  packages/shell-init-generator
  packages/shim-generator
  packages/symlink-generator
  packages/testing-helpers
  packages/tool-config-builder
  packages/unwrap-value
  packages/utils
  packages/version-checker
  packages/dashboard/src/server
  packages/dashboard/src/shared
)

bun test "${packages[@]}"

# Run dashboard client tests with DOM preloads
cd packages/dashboard
bun test --preload ./preload/happydom.ts --preload ./preload/testing-library.ts src/client
