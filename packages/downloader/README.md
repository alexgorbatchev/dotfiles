# @dotfiles/downloader

HTTP download utilities with progress tracking, caching, and error handling. Provides a unified interface for downloading files from various sources.

## Overview

The downloader package handles all file download operations for the dotfiles system. It provides progress tracking, caching capabilities, and robust error handling for downloading tool binaries, archives, and other assets.

## Features

- **Progress Tracking**: Real-time progress bar with download speed and ETA
- **Caching**: Optional file caching to avoid repeated downloads
- **Multiple Strategies**: Support for different download methods
- **Error Handling**: Comprehensive error messages and retry logic
- **Stream Support**: Memory-efficient streaming downloads
- **Type-Safe**: Full TypeScript support with exported interfaces

## Architecture

### Components

- **Downloader**: Main downloader class orchestrating downloads
- **DownloadStrategy**: Interface for different download implementations
- **NodeFetchStrategy**: Default strategy using native fetch
- **CachedDownloadStrategy**: Wrapper adding caching to any strategy
- **FileCache**: Cache implementation for downloaded files
- **ProgressBar**: CLI progress bar for download feedback

## API

### `Downloader`

Main class for downloading files.

```typescript
import { Downloader } from "@dotfiles/downloader";

const downloader = new Downloader(logger, fileSystem, strategy);

await downloader.download({
  url: "https://example.com/file.tar.gz",
  destination: "/path/to/file.tar.gz",
  filename: "file.tar.gz",
  showProgress: true,
});
```

### `IDownloader`

Interface for download operations.

```typescript
interface IDownloader {
  download(options: DownloadOptions): Promise<void>;
}

interface IDownloadOptions {
  url: string;
  destination: string;
  filename: string;
  showProgress?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}
```

### `DownloadStrategy`

Interface for implementing custom download methods.

```typescript
interface IDownloadStrategy {
  download(options: DownloadOptions): Promise<void>;
}
```

## Usage Examples

### Basic Download

```typescript
import { Downloader, NodeFetchStrategy } from "@dotfiles/downloader";
import { FileSystem } from "@dotfiles/file-system";
import { createTsLogger } from "@dotfiles/logger";

const logger = createTsLogger();
const fileSystem = new FileSystem(logger);
const strategy = new NodeFetchStrategy(logger, fileSystem);
const downloader = new Downloader(logger, fileSystem, strategy);

// Download a file
await downloader.download({
  url: "https://example.com/tool-v1.0.0.tar.gz",
  destination: "/tmp/tool.tar.gz",
  filename: "tool.tar.gz",
  showProgress: true,
});
```

### Download with Progress Tracking

```typescript
import { Downloader } from "@dotfiles/downloader";

await downloader.download({
  url: "https://example.com/large-file.zip",
  destination: "/tmp/large-file.zip",
  filename: "large-file.zip",
  showProgress: true, // Shows progress bar
});

// Output:
// Downloading large-file.zip
// [████████████████████] 100% | 45.2 MB/45.2 MB | 5.2 MB/s | ETA: 0s
```

### Download with Caching

```typescript
import { CachedDownloadStrategy, Downloader, NodeFetchStrategy } from "@dotfiles/downloader";
import { FileCache } from "@dotfiles/downloader/cache";

// Create cache
const cache = new FileCache(logger, fileSystem, cacheDir);

// Wrap strategy with caching
const baseStrategy = new NodeFetchStrategy(logger, fileSystem);
const cachedStrategy = new CachedDownloadStrategy(baseStrategy, cache);

// Create downloader with caching
const downloader = new Downloader(logger, fileSystem, cachedStrategy);

// First download - fetches from URL
await downloader.download({
  url: "https://example.com/tool.tar.gz",
  destination: "/tmp/tool.tar.gz",
  filename: "tool.tar.gz",
});

// Second download - serves from cache
await downloader.download({
  url: "https://example.com/tool.tar.gz", // Same URL
  destination: "/tmp/tool-copy.tar.gz",
  filename: "tool.tar.gz",
});
```

### Download with Custom Headers

```typescript
await downloader.download({
  url: "https://api.github.com/repos/owner/repo/releases/assets/12345",
  destination: "/tmp/asset.zip",
  filename: "asset.zip",
  headers: {
    Accept: "application/octet-stream",
    Authorization: `Bearer ${githubToken}`,
  },
});
```

### Download with Timeout

```typescript
await downloader.download({
  url: "https://slow-server.example.com/file.tar.gz",
  destination: "/tmp/file.tar.gz",
  filename: "file.tar.gz",
  timeout: 30000, // 30 seconds
});
```

### Error Handling

```typescript
import { DownloadError } from "@dotfiles/downloader";

try {
  await downloader.download({
    url: "https://example.com/file.tar.gz",
    destination: "/tmp/file.tar.gz",
    filename: "file.tar.gz",
  });
} catch (error) {
  if (error instanceof DownloadError) {
    console.error(`Download failed: ${error.message}`);
    console.error(`URL: ${error.url}`);
    console.error(`Status: ${error.statusCode}`);
  }
}
```

## Download Strategies

### NodeFetchStrategy

Default strategy using Node.js native fetch API.

**Features:**

- Uses native fetch (no external dependencies)
- Streaming downloads (memory efficient)
- Automatic progress tracking
- Proper error handling

```typescript
import { NodeFetchStrategy } from "@dotfiles/downloader";

const strategy = new NodeFetchStrategy(logger, fileSystem);
```

### CachedDownloadStrategy

Wrapper that adds caching to any download strategy.

**Features:**

- Caches downloaded files by URL
- Configurable TTL (time-to-live)
- Automatic cache cleanup
- Cache hit/miss logging

```typescript
import { CachedDownloadStrategy } from "@dotfiles/downloader";

const cachedStrategy = new CachedDownloadStrategy(baseStrategy, cache);
```

### Custom Strategy

Implement your own download strategy:

```typescript
import type { DownloadOptions, DownloadStrategy } from "@dotfiles/downloader";

class CustomStrategy implements DownloadStrategy {
  async download(options: DownloadOptions): Promise<void> {
    // Custom download implementation
  }
}

const downloader = new Downloader(logger, fileSystem, new CustomStrategy());
```

## File Caching

### FileCache

Implements file-based caching for downloads.

```typescript
import { FileCache } from "@dotfiles/downloader/cache";

const cache = new FileCache(logger, fileSystem, cacheDirectory, {
  ttl: 86400, // 24 hours
  maxSize: 1024 * 1024 * 1024, // 1 GB
});

// Check if URL is cached
const isCached = await cache.has(url);

// Get cached file
const cachedPath = await cache.get(url);

// Store file in cache
await cache.set(url, filePath);

// Clear cache
await cache.clear();
```

### Cache Options

```typescript
interface ICacheOptions {
  /**
   * Time-to-live in seconds
   * @default 86400 (24 hours)
   */
  ttl?: number;

  /**
   * Maximum cache size in bytes
   * @default undefined (no limit)
   */
  maxSize?: number;

  /**
   * Whether to validate cache entries
   * @default true
   */
  validate?: boolean;
}
```

## Progress Bar

The progress bar provides visual feedback during downloads:

```typescript
import { ProgressBar } from "@dotfiles/downloader";

const progressBar = new ProgressBar(filename);

progressBar.start(totalBytes);
progressBar.update(downloadedBytes);
progressBar.stop();
```

**Features:**

- Real-time progress percentage
- Download speed calculation
- ETA (estimated time remaining)
- Automatic terminal width adjustment
- Clean completion state

## Error Handling

### DownloadError

Custom error class for download failures.

```typescript
class DownloadError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number,
    public readonly cause?: Error,
  ) {
    super(message);
  }
}
```

### Common Error Scenarios

```typescript
// Network errors
Error: Download failed: Network timeout
Error: Download failed: Connection refused

// HTTP errors
Error: Download failed: 404 Not Found
Error: Download failed: 403 Forbidden

// Filesystem errors
Error: Failed to write file: Permission denied
Error: Failed to create directory: Disk full
```

## Dependencies

### Internal Dependencies

- `@dotfiles/file-system` - Filesystem operations
- `@dotfiles/logger` - Structured logging

### External Dependencies

- `cli-progress` - Progress bar implementation

## Testing

Run tests with:

```bash
bun test packages/downloader
```

The package includes tests for:

- Download success scenarios
- Progress tracking
- Error handling
- Caching behavior
- Strategy selection
- Edge cases

## Logging

The downloader uses structured logging:

```typescript
// Log messages defined in log-messages.ts
logger.debug("Starting download", { url, destination });
logger.info("Download completed", { url, size, duration });
logger.error("Download failed", { url, error, statusCode });

// Cache logging
logger.debug("Cache hit", { url, cachedPath });
logger.debug("Cache miss", { url });
```

## Performance Considerations

### Streaming Downloads

```typescript
// Downloads are streamed to avoid loading entire file in memory
const stream = response.body;
const fileStream = fs.createWriteStream(destination);
await stream.pipeTo(fileStream);
```

### Concurrent Downloads

```typescript
// Download multiple files in parallel
await Promise.all([
  downloader.download({ url: url1, destination: dest1, filename: "file1" }),
  downloader.download({ url: url2, destination: dest2, filename: "file2" }),
  downloader.download({ url: url3, destination: dest3, filename: "file3" }),
]);
```

### Cache Efficiency

```typescript
// Cache reduces network usage for repeated downloads
// First download: 10s
// Second download (cached): 0.1s
```

## Best Practices

### Always Show Progress for Large Files

```typescript
const isLargeFile = fileSize > 10 * 1024 * 1024; // > 10 MB

await downloader.download({
  url,
  destination,
  filename,
  showProgress: isLargeFile,
});
```

### Use Caching for Repeated Downloads

```typescript
// Enable caching for tool installations
const cachedStrategy = new CachedDownloadStrategy(baseStrategy, cache);
const downloader = new Downloader(logger, fileSystem, cachedStrategy);
```

### Handle Network Errors Gracefully

```typescript
try {
  await downloader.download(options);
} catch (error) {
  if (error instanceof DownloadError && error.statusCode === 404) {
    // Try alternative URL
    await downloader.download({ ...options, url: alternativeUrl });
  } else {
    throw error;
  }
}
```

### Clean Up Failed Downloads

```typescript
try {
  await downloader.download(options);
} catch (error) {
  // Remove partial download
  await fileSystem.remove(destination);
  throw error;
}
```

## Design Decisions

### Why Strategy Pattern?

The strategy pattern allows:

- Easy testing with mock strategies
- Multiple download implementations
- Runtime strategy selection
- Transparent caching addition

### Why Separate Cache Package?

Separating cache functionality:

- Enables reuse in other packages
- Simplifies testing
- Allows alternative cache implementations
- Keeps concerns separated

### Why Progress Bar?

Progress feedback:

- Improves user experience
- Shows download is active
- Provides time estimates
- Indicates potential problems

## Future Enhancements

Potential improvements:

- Resume interrupted downloads
- Parallel chunk downloading
- Download verification (checksums)
- Bandwidth limiting
- Proxy support
- Retry with exponential backoff
- Download queuing and prioritization
