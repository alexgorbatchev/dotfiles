# pkg/proxy

Development HTTP caching proxy behind `DEV_PROXY`: the server plus the `*http.Client` (`Server.Client()`) that routes requests through it.

## Commands

- Test: `go test ./pkg/proxy/...`
- Run a command through it: `DEV_PROXY=3128 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts check-updates`

## Local conventions

- The wire format is v1's `proxyFetch` one: the target URL travels in the request path (`GET /https://api.github.com/repos/o/r`). `Client()` produces it in a `RoundTripper`; callers never build proxy URLs by hand. A standard forward proxy (`http.Transport.Proxy`) is not an option because HTTPS would be tunnelled with CONNECT and never cached.
- The proxy intentionally ignores origin cache headers and caches every 2xx/3xx for the TTL. Do not "fix" that unless the development contract changes.
- Cache entries are `<sha256(METHOD:URL)>.meta.json` + `.body` under `cacheDir/<first two hex chars>/`. Clearing the cache means deleting the directory; there are no management endpoints because the server only lives as long as the command that started it.
- Log every request as `[HIT]` or `[MISS]`; no emoji in CLI output.

## Local gotchas

- The server's lifetime is the command's: `cmd/dotfiles/devproxy.go` starts it and `Services.Close()` stops it. A test that starts one must `Stop()` it, or the port stays bound for the rest of the package run.
- Stale cached responses during API tests -> delete `.tmp/http-proxy-cache` before rerunning.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `proxy_test.go`.
- Ask first: changing the wire format, the cache key shape, or the persistence layout.
- Never: cache authenticated private tokens to disk without encryption.

## References

- `pkg/proxy/proxy.go`
- `cmd/dotfiles/devproxy.go`
