# pkg/proxy

HTTP caching proxy server.

## Commands

- Test: `go test ./pkg/proxy/...`

## Local conventions

- Cache HTTP responses locally during development and offline testing.

## Local gotchas

- Stale cached HTTP responses during API tests -> clear cache directory before running fixture checks.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `proxy_test.go`.
- Ask first: modifying HTTP proxy port or cache invalidation strategy.
- Never: cache authenticated private tokens to disk without encryption.

## References

- `pkg/proxy/proxy.go`
