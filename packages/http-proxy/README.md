# @dotfiles/http-proxy

A standalone HTTP caching proxy that ignores server cache headers to prevent rate limiting by production APIs.

## Features

- **Transparent proxying**: Forwards requests to target servers
- **Aggressive caching**: Ignores server cache headers (Cache-Control, Expires, etc.)
- **File-based storage**: Persists cache to disk (metadata + raw binary body)
- **Selective invalidation**: Clear cache entries using glob patterns
- **Pre-population**: Seed cache with known responses
- **Configurable**: CLI arguments for cache directory, port, and TTL

## Usage

### Start the proxy server

```bash
# Default settings (cache at .tmp/http-proxy-cache/, port 3128)
bun proxy

# Custom cache directory
bun proxy --cache-dir=/path/to/cache

# Custom port
bun proxy --port=8080

# Custom TTL (in milliseconds)
bun proxy --ttl=604800000  # 7 days
```

### Make requests through the proxy

```bash
# Request via proxy URL path
curl http://localhost:3128/https://api.github.com/repos/owner/repo

# Check cache status via response header
curl -I http://localhost:3128/https://api.github.com/repos/owner/repo
# X-Dotfiles-Cache: HIT  (served from cache)
# X-Dotfiles-Cache: MISS (fetched from origin)
```

### Use with CLI

Set the `DEV_PROXY` environment variable to enable proxy routing:

```bash
DEV_PROXY=3128 bun cli install bat
```

### Clear cache entries

```bash
# Clear all cache entries
curl -X POST http://localhost:3128/cache/clear \
  -H "Content-Type: application/json" \
  -d '{}'

# Clear entries matching glob pattern
curl -X POST http://localhost:3128/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"pattern": "**/github.com/**"}'

# Clear entries matching multiple patterns
curl -X POST http://localhost:3128/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"patterns": ["**/api.github.com/**", "**/repos/**"]}'
```

## API

### `POST /cache/clear`

Clear cache entries matching glob patterns.

**Request body:**

```json
{
  "pattern": "string", // Single glob pattern (optional)
  "patterns": ["string"] // Array of glob patterns (optional)
}
```

If no pattern is provided or pattern is `*`, clears all cache entries.

**Response:**

```json
{
  "cleared": 5,
  "message": "Cleared 5 cache entries"
}
```

### `GET /cache/stats`

Get cache statistics.

**Response:**

```json
{
  "entries": 42,
  "size": 1048576
}
```

### `POST /cache/populate`

Pre-populate cache with a known response.

**Request body:**

```json
{
  "url": "https://api.example.com/data",
  "body": "response content",
  "method": "GET", // Optional, defaults to GET
  "status": 200, // Optional, defaults to 200
  "headers": {}, // Optional response headers
  "bodyIsBase64": false, // Optional, set true for binary data
  "ttl": 86400000 // Optional TTL override
}
```

**Response:**

```json
{
  "success": true,
  "key": "abc123...",
  "url": "https://api.example.com/data",
  "message": "Cached GET https://api.example.com/data"
}
```

## Storage Format

Cache entries are stored as two files per request:

- `{hash}.meta.json` - Metadata (URL, method, status, headers, timestamps)
- `{hash}.body` - Raw binary response body

Files are organized into subdirectories based on the first 2 characters of the SHA-256 hash:

```
.tmp/http-proxy-cache/
├── e6/
│   ├── e6d0a28f...meta.json
│   └── e6d0a28f...body
└── 63/
    ├── 63f8a2b1...meta.json
    └── 63f8a2b1...body
```

## Configuration

| Argument      | Default                 | Description                 |
| ------------- | ----------------------- | --------------------------- |
| `--cache-dir` | `.tmp/http-proxy-cache` | Directory for cache storage |
| `--port`      | `3128`                  | Proxy server port           |
| `--ttl`       | `86400000` (24h)        | Cache TTL in milliseconds   |
