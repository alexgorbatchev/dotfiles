/* oxlint-disable no-console */
import { join } from "node:path";

import { dedentString } from "@dotfiles/utils";

import { createProxyServer } from "./createProxyServer";
import type { ProxyConfig } from "./types";

const DEFAULT_PORT = 3128;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CACHE_DIR = ".tmp/http-proxy-cache";

/**
 * Parse CLI arguments.
 */
function parseArgs(): ProxyConfig {
  const args = process.argv.slice(2);
  const config: ProxyConfig = {
    cacheDir: join(process.cwd(), DEFAULT_CACHE_DIR),
    port: DEFAULT_PORT,
    ttl: DEFAULT_TTL,
  };

  for (const arg of args) {
    if (arg.startsWith("--cache-dir=")) {
      const value = arg.slice("--cache-dir=".length);
      config.cacheDir = value.startsWith("/") ? value : join(process.cwd(), value);
    } else if (arg.startsWith("--port=")) {
      const value = parseInt(arg.slice("--port=".length), 10);
      if (!isNaN(value)) {
        config.port = value;
      }
    } else if (arg.startsWith("--ttl=")) {
      const value = parseInt(arg.slice("--ttl=".length), 10);
      if (!isNaN(value)) {
        config.ttl = value;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        dedentString(`
        HTTP Caching Proxy

        Usage: bun run packages/http-proxy/src/server.ts [options]

        Options:
          --cache-dir=<path>  Cache directory (default: .tmp/http-proxy-cache)
          --port=<number>     Server port (default: 3128)
          --ttl=<ms>          Cache TTL in milliseconds (default: 86400000 = 24h)
          --help, -h          Show this help

        Endpoints:
          POST /cache/clear   Clear cache entries (body: { pattern?: string, patterns?: string[] })
          GET  /cache/stats   Get cache statistics

        Example:
          bun run packages/http-proxy/src/server.ts --port=8080 --cache-dir=/tmp/my-cache
      `),
      );
      process.exit(0);
    }
  }

  return config;
}

/**
 * Start the proxy server.
 */
function main(): void {
  const config = parseArgs();
  const app = createProxyServer(config);

  app.listen(config.port, () => {
    console.log(`🚀 HTTP Caching Proxy started`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Cache: ${config.cacheDir}`);
    console.log(`   TTL: ${config.ttl}ms`);
    console.log(`\nEndpoints:`);
    console.log(`   POST /cache/clear - Clear cache entries`);
    console.log(`   GET  /cache/stats - Cache statistics`);
  });
}

main();
