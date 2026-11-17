---
created_on: 2026-10-07 09:59
last_modified: 2026-10-07 09:59
status: current
---

# pkg/catalog

Static catalog wire validation, bounded discovery transport, cached source inspection and deterministic queries.

## Commands

- Test: `go test ./pkg/catalog/...`
- Race and coverage: `go test -race -count=1 -coverprofile=.tmp/catalog-coverage.out ./pkg/catalog/...`
- Query measurement: `go test -run '^$' -bench Query10000 -benchmem ./pkg/catalog/...`

## Boundaries

- The 2026-10-07 milestone includes discovery only. Do not add definition evaluation, imports, updates, provenance, planning, installation verification or transactions here.
- Use `config.InstallMethods()` as the method vocabulary and the existing bounded downloader for static GETs. Suppress inherited installation callbacks and reject origin/API escape before dispatch.
- Keep strict wire property/null/integer handling and exact object hash/size checks. Cached content remains a performance aid; it grants no source execution or project mutation authority.
- Keep verification metadata validation and truthful display from the existing wire schema. Empty history is unverified; synthetic fixtures supply no published evidence.
- Accompany runtime changes with behavioral tests, genuine disabled/restored checks and minimum 90% coverage. Record new instructions here; preserve public protocol/dependency approval boundaries.
- Never push, merge, publish or deploy without explicit authorization.
