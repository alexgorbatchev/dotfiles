# pkg/arch

Architecture detection and normalization.

## Commands

- Test: `go test ./pkg/arch/...`

## Local conventions

- Normalize architecture strings (`x86_64` -> `amd64`, `aarch64` -> `arm64`).
- `dataAssetPatterns` match files that can never run (checksums, signatures, metadata, packages); `auxiliaryAssetPatterns` match runnable artifacts that are not the tool (`buildable-artifact`, cargo-dist's `-update` self-updater). `IsNonBinaryAsset` is their union and drives selection; `IsDataAsset` is what installers refuse after download, so an explicitly selected auxiliary asset still installs.
- `SelectBestMatch` prefers a candidate `archive.IsSupported` accepts only as the final tiebreaker, after OS, CPU and libc ranking.

## Local gotchas

- Non-standard arch names in download URLs can break asset matching -> ensure normalized mapping covers legacy platform names.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `arch_test.go`.
- Ask first: changing canonical architecture string mappings.
- Never: break standard Go `GOARCH` output formatting.

## References

- `pkg/arch/arch.go`
