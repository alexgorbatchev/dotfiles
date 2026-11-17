# pkg/catalog

Static catalog discovery and Git retrieval of tool definitions and accompanying files.

## Commands

- Test: `go test ./pkg/catalog/...`
- Race and coverage: `go test -race -count=1 -coverprofile=.tmp/catalog-coverage.out ./pkg/catalog/...`
- Query measurement: `go test -run '^$' -bench Query10000 -benchmem ./pkg/catalog/...`

## Boundaries

- Support static discovery and Git file retrieval. Retrieval reads the existing sharded source layout at one pinned commit, copies the selected tool directory, and refuses existing destinations. Never evaluate downloaded definitions during retrieval. Updates, durable provenance tracking, planning, installation verification and publishing remain outside this implementation.
- Use `config.InstallMethods()` as the method vocabulary and the existing bounded downloader for static GETs. Suppress inherited installation callbacks and reject origin/API escape before dispatch.
- Keep strict wire property/null/integer handling and exact object hash/size checks. Cached content remains a performance aid; it grants no source execution or project mutation authority.
- Keep verification metadata validation and truthful display from the existing wire schema. Empty history is unverified; synthetic fixtures supply no published evidence.
- Accompany runtime changes with behavioral tests, genuine disabled/restored checks and minimum 90% coverage. Record new instructions here; preserve public protocol/dependency approval boundaries.
- Never push, merge, publish or deploy without explicit authorization.
