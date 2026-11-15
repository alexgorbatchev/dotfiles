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

## CLI Development Invocation

Use `just run`, `just test-project`, `just run-ai` or `just dashboard` when running
the CLI from source. These recipes set `DOTFILES_REPO_ROOT` to the checkout root.
Generated wrappers and shims then invoke `go -C <root> run ./cmd/dotfiles`, which
continues to work when the shell's working directory is outside the checkout.
The saved invocation carries its explicit source root into subsequent runs, without
changing the calling shell's environment.
For a direct `go run`, set `DOTFILES_REPO_ROOT` explicitly to the absolute checkout
path when generated shell integration should invoke source code again.

Without that variable, self-invocation uses the executing binary, including binaries
installed beneath temporary directories or directories containing `_test` or
`go-build`. A nearby `go.mod` does not select development mode or a configuration.
`DOTFILES_REPO_ROOT` also enables configuration fallback to that root after the
normal [configuration lookup](cli-reference.md#configuration-lookup).
`DOTFILES_E2E_TEST=true` keeps self-invocation on the compiled test binary.

`DOTFILES_CLI_COMMAND` overrides self-invocation. Its value is either a literal
executable path or the legacy `go run ` prefix followed by one literal package path.
It is not parsed as shell code; quotes, dollar signs and spaces in the path remain
part of that path. The override takes precedence over development and E2E modes.

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
