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

### Development HTTP Proxy

To avoid rate limiting during development, you can use the built-in HTTP caching proxy:

```bash
# Run CLI commands through the proxy
DEV_PROXY=3128 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts install bat
```

The proxy caches all HTTP responses locally. This is useful when repeatedly testing installations against GitHub or other APIs. See `pkg/proxy/AGENTS.md` for full documentation.
