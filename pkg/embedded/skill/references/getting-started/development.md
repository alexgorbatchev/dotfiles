# Development

```bash
# Run Go unit tests
go test ./...

# Run Go E2E tests
go test ./tests/e2e/...

# Lint and format TypeScript client and scripts
bun lint

# Type-check TypeScript client and scripts
bun typecheck

# Full check (lint + typecheck + tests + compile)
bun check

# Build / compile binaries
bun compile
```

## Development HTTP Proxy

Set `DEV_PROXY` to a port to run a command through the built-in HTTP caching proxy, so repeated installs against GitHub and other rate-limited APIs are answered locally:

```bash
# Run CLI commands through the proxy
DEV_PROXY=3128 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts tool install bat
```

The CLI starts the proxy on `127.0.0.1:<port>` for the duration of the command and stops it on exit. While it runs, every outbound request of the installers (release API lookups and asset downloads for `github-release`, `gitea-release`, `cargo`, `dmg`, `pkg`, `curl-tar`, `curl-binary`, `curl-script`), of `dotfiles self upgrade`, and of the dashboard's README fetch goes through it. Each request is logged on stderr as `[MISS]` (fetched from the origin) or `[HIT]` (served from the cache).

- Every 2xx and 3xx response is cached for 24 hours, regardless of the origin's cache headers; error responses are not cached.
- The cache lives in `.tmp/http-proxy-cache` under the working directory. Delete that directory to clear it.
- `DEV_PROXY` must be an integer between 1 and 65535 and the port must be free; otherwise the command fails immediately rather than running without the proxy.
- The installers' own caches under `.generated/cache` are checked before any request is made, so a repeated install can complete without reaching the proxy at all; `install --force` bypasses the release-metadata cache.

`DEV_PROXY` is the only way to enable the proxy; there is no `proxy` key in `dotfiles.config.ts`.
