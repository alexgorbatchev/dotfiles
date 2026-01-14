# unwrap-value Usage Analysis

This document tracks locations where `unwrap-value` module (`resolveValue` function and `Resolvable` type) should be used instead of inline implementations.

## Summary

The `unwrap-value` module provides:

- `Resolvable<TParams, TReturn>` - A type for values that can be static, sync function, or async function
- `resolveValue(params, resolvable)` - A function to resolve such values

## Packages to Analyze

- [x] arch
- [x] archive-extractor
- [x] build
- [x] cli
- [x] config
- [x] core
- [x] downloader
- [x] e2e-test
- [x] features
- [x] file-system
- [x] generator-orchestrator
- [x] installer
- [x] installer-brew
- [x] installer-cargo
- [x] installer-curl-script
- [x] installer-curl-tar
- [x] installer-github
- [x] installer-manual
- [x] logger
- [x] registry
- [x] registry-database
- [x] shell-init-generator
- [x] shim-generator
- [x] symlink-generator
- [x] testing-helpers
- [x] tool-config-builder
- [x] utils
- [x] version-checker

## Analysis Results

### arch

- [x] No usages of unwrap-value needed - package contains pure functions with direct values only.

### archive-extractor

- [x] No usages of unwrap-value needed - package contains class methods with direct values only.

### build

- [x] No usages of unwrap-value needed - build scripts with direct values only.

### cli

- [x] No usages of unwrap-value needed - CLI commands and service initialization with direct values only. Note: `defineTool()` is a higher-order function that always expects a function (not value-or-function polymorphism), so it doesn't use the `Resolvable` pattern.

### config

- [x] No usages of unwrap-value needed - config processing with direct values.

### core

- [x] Already uses `unwrap-value` correctly - `Resolvable` type is imported and used for `ShellCompletionConfigInput` in [builder/builder.types.ts](packages/core/src/builder/builder.types.ts). No inline implementations needing replacement.

### downloader

- [x] No usages of unwrap-value needed - download strategies and caching with direct values only.

### e2e-test

- [x] No usages of unwrap-value needed - test utilities with direct values only.

### features

- [x] No usages of unwrap-value needed - README service with direct values only.

### file-system

- [x] No usages of unwrap-value needed - filesystem abstraction with direct values only.

### generator-orchestrator

- [x] Already uses `unwrap-value` correctly - `resolveValue` is imported and used in [GeneratorOrchestrator.ts](packages/generator-orchestrator/src/GeneratorOrchestrator.ts) to resolve shell completion configuration. No additional usages needed.

### installer

- [x] No usages of unwrap-value needed - installer orchestration with hooks, events, and registry integration. All values are direct, no resolvable patterns.

### installer-brew

- [x] No usages of unwrap-value needed - Homebrew installation with direct values and shell commands only.

### installer-cargo

- [x] No usages of unwrap-value needed - Cargo/crates.io installation with direct values and hook execution only.

### installer-curl-script

- [x] **CANDIDATE FOUND** - `resolveScriptArgs` in [installFromCurlScript.ts](packages/installer-curl-script/src/installFromCurlScript.ts#L24-L43) uses inline `typeof params.args === 'function'` pattern
  - [ ] [installFromCurlScript.ts](packages/installer-curl-script/src/installFromCurlScript.ts) - `resolveScriptArgs` function should use `resolveValue` instead of inline `typeof` check

### installer-curl-tar

- [x] No usages of unwrap-value needed - curl-tar installation with direct values only.

### installer-github

- [x] No usages of unwrap-value needed - GitHub release installation with direct values and API clients only.

### installer-manual

- [x] No usages of unwrap-value needed - manual installation with direct values only.

### logger

- [x] No usages of unwrap-value needed - logging utilities with direct values only.

### registry

- [x] No usages of unwrap-value needed - registry implementations with direct values only.

### registry-database

- [x] No usages of unwrap-value needed - database operations with direct values only.

### shell-init-generator

- [x] No usages of unwrap-value needed - contains `typeof === 'function'` for type narrowing, not resolvable pattern.

### shim-generator

- [x] No usages of unwrap-value needed - shim generation with direct values only.

### symlink-generator

- [x] No usages of unwrap-value needed - symlink operations with direct values only.

### testing-helpers

- [x] No usages of unwrap-value needed - contains `typeof === 'function'` for test matcher processing, not resolvable pattern.

### tool-config-builder

- [x] No usages of unwrap-value needed - contains `typeof === 'function'` for method overloading detection and promise type guards, not resolvable pattern.

### utils

- [x] No usages of unwrap-value needed - utility functions with direct values only.

### version-checker

- [x] No usages of unwrap-value needed - version checking with direct values only.
