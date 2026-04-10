# Development

```bash
# Run all tests (fast parallel runner)
bun test:all

# Run tests with native bun test runner (accepts bun test arguments)
bun test:native

# Lint and format the codebase
bun lint

# Type-check
bun typecheck

# Full check (lint + typecheck + test)
bun check
```

### Development HTTP Proxy

To avoid rate limiting during development, you can use the built-in HTTP caching proxy:

```bash
# Start the proxy server (default port 3128)
bun proxy

# Run CLI commands through the proxy
DEV_PROXY=3128 bun cli install bat
```

The proxy caches all HTTP responses locally, ignoring server cache headers. This is useful when repeatedly testing installations against GitHub or other APIs. See [packages/http-proxy/README.md](packages/http-proxy/README.md) for full documentation.
