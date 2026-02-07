---
name: bun
description: >-
  Bun runtime and bundler API reference. Use when working with Bun for HTTP
  servers, WebSockets, routing, file I/O, databases (SQL, SQLite, Redis, S3),
  bundling, HMR, CSS, plugins, shell scripting, or other Bun-specific APIs.
targets:
  - '*'
---

# Bun

Bun runtime API reference and patterns.

## References

### HTTP Server

- [Server](https://bun.com/docs/runtime/http/server.md) - Bun.serve API for high-performance HTTP servers
- [Routing](https://bun.com/docs/runtime/http/routing.md) - Define routes with static paths, parameters, and wildcards
- [Cookies](https://bun.com/docs/runtime/http/cookies.md) - Work with cookies in HTTP requests and responses
- [TLS](https://bun.com/docs/runtime/http/tls.md) - Enable TLS/HTTPS in Bun.serve
- [Error Handling](https://bun.com/docs/runtime/http/error-handling.md) - Handle errors in Bun's development server
- [Metrics](https://bun.com/docs/runtime/http/metrics.md) - Monitor server activity with built-in metrics

- [Fetch](https://bun.com/docs/runtime/networking/fetch.md) - Send HTTP requests with Bun's fetch API
- [WebSockets](https://bun.com/docs/runtime/http/websockets.md) - Server-side WebSockets in Bun

### Bundler

- [Fullstack Dev Server](https://bun.com/docs/bundler/fullstack.md) - HTML imports, React integration, HMR, Tailwind plugin, and production builds
- [Bundler](https://bun.com/docs/bundler/index.md) - Bun.build API for bundling with code splitting, minification, and plugins
- [Loaders](https://bun.com/docs/bundler/loaders.md) - Built-in loaders for JS, TS, JSX, JSON, TOML, YAML, CSS, HTML, and file assets
- [Plugins](https://bun.com/docs/bundler/plugins.md) - Universal plugin API with onResolve, onLoad, onStart lifecycle hooks
- [Macros](https://bun.com/docs/bundler/macros.md) - Run JavaScript functions at bundle-time with import attributes
- [Hot Reloading](https://bun.com/docs/bundler/hot-reloading.md) - import.meta.hot API for HMR with accept, dispose, data, and event hooks
- [CSS](https://bun.com/docs/bundler/css.md) - CSS bundling with modern syntax transpiling, vendor prefixing, CSS modules, and minification

### Data & Storage

- [Cookies](https://bun.com/docs/runtime/cookies.md) - Native APIs for working with HTTP cookies
- [File I/O](https://bun.com/docs/runtime/file-io.md) - Optimized APIs for reading and writing files
- [Streams](https://bun.com/docs/runtime/streams.md) - Work with binary data without loading it all into memory
- [Binary Data](https://bun.com/docs/runtime/binary-data.md) - Working with binary data in JavaScript
- [Archive](https://bun.com/docs/runtime/archive.md) - Create and extract tar archives with native implementation
- [SQL](https://bun.com/docs/runtime/sql.md) - Native bindings for PostgreSQL, MySQL, and SQLite
- [SQLite](https://bun.com/docs/runtime/sqlite.md) - High-performance native SQLite3 driver
- [S3](https://bun.com/docs/runtime/s3.md) - Native bindings for S3-compatible object storage
- [Redis](https://bun.com/docs/runtime/redis.md) - Native Redis client with Promise-based API

### File & Module System

- [File Types](https://bun.com/docs/runtime/file-types.md) - File types and loaders supported by Bun's bundler and runtime
- [Module Resolution](https://bun.com/docs/runtime/module-resolution.md) - How Bun resolves modules and handles imports
- [JSX](https://bun.com/docs/runtime/jsx.md) - Built-in JSX and TSX support with configurable transpilation
- [Auto-install](https://bun.com/docs/runtime/auto-install.md) - Automatic package installation for standalone scripts
- [Plugins](https://bun.com/docs/runtime/plugins.md) - Universal plugin API for extending runtime and bundler
- [File System Router](https://bun.com/docs/runtime/file-system-router.md) - Fast API for resolving routes against file-system paths

### Utilities

- [Secrets](https://bun.com/docs/runtime/secrets.md) - Store and retrieve sensitive credentials securely
- [Console](https://bun.com/docs/runtime/console.md) - The console object in Bun
- [YAML](https://bun.com/docs/runtime/yaml.md) - Built-in support for YAML files through runtime APIs and bundler
- [HTMLRewriter](https://bun.com/docs/runtime/html-rewriter.md) - Transform HTML documents with CSS selectors
- [Hashing](https://bun.com/docs/runtime/hashing.md) - Hash and verify passwords with cryptographically secure algorithms
- [Glob](https://bun.com/docs/runtime/glob.md) - Fast native implementation of file globbing
- [Semver](https://bun.com/docs/runtime/semver.md) - Semantic versioning API
- [Color](https://bun.com/docs/runtime/color.md) - Format colors as CSS, ANSI, numbers, hex strings
- [Utils](https://bun.com/docs/runtime/utils.md) - Utility functions for working with the runtime

### Process & System

- [Environment Variables](https://bun.com/docs/runtime/environment-variables.md) - Read and configure environment variables with .env support
- [Shell](https://bun.com/docs/runtime/shell.md) - Shell scripting API to run shell commands from JavaScript
- [Spawn](https://bun.com/docs/runtime/child-process.md) - Spawn child processes with Bun.spawn or Bun.spawnSync
