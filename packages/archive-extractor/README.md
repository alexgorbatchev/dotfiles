# @dotfiles/archive-extractor

Archive extraction utilities for unpacking various archive formats (.tar.gz, .zip, .tar.xz, etc.) used in tool installation. Provides a unified interface for extraction with progress tracking and error handling.

## Overview

The archive extractor package handles the extraction of downloaded tool archives. It supports multiple archive formats and provides detailed extraction results including file lists and directory information.

## Features

- **Multiple Archive Formats**: Support for tar.gz, tar.xz, tar.bz2, zip, and plain tar
- **Progress Tracking**: Optional progress callbacks during extraction
- **Detailed Results**: Returns list of extracted files and directories
- **Error Handling**: Comprehensive error messages for extraction failures
- **Type-Safe**: Full TypeScript support with exported interfaces

## Supported Formats

- `.tar.gz` / `.tgz` - Gzipped tar archives
- `.tar.xz` - XZ-compressed tar archives  
- `.tar.bz2` - Bzip2-compressed tar archives
- `.tar` - Uncompressed tar archives
- `.zip` - ZIP archives

## API

### `IArchiveExtractor`

Interface for archive extraction operations.

```typescript
interface IArchiveExtractor {
  extract(
    archivePath: string,
    destinationPath: string,
    options?: ExtractOptions
  ): Promise<ExtractResult>;
}
```

### `ArchiveExtractor`

Main implementation of the archive extractor.

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';

const extractor = new ArchiveExtractor(logger, fileSystem);
```

### `ExtractResult`

Result object returned after extraction.

```typescript
interface IExtractResult {
  extractedFiles: string[];
  extractedDir: string;
  success: boolean;
  error?: string;
}
```

## Usage Examples

### Basic Extraction

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';
import { createTsLogger } from '@dotfiles/logger';
import { FileSystem } from '@dotfiles/file-system';

const logger = createTsLogger();
const fileSystem = new FileSystem(logger);
const extractor = new ArchiveExtractor(logger, fileSystem);

// Extract a tar.gz archive
const result = await extractor.extract(
  '/downloads/tool-v1.0.0.tar.gz',
  '/install/tool'
);

if (result.success) {
  console.log('Extracted files:', result.extractedFiles);
  console.log('Extract directory:', result.extractedDir);
} else {
  console.error('Extraction failed:', result.error);
}
```

### With Progress Tracking

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';

const extractor = new ArchiveExtractor(logger, fileSystem);

const result = await extractor.extract(
  '/downloads/large-tool.tar.gz',
  '/install/tool',
  {
    onProgress: (current, total) => {
      const percent = (current / total) * 100;
      console.log(`Extracting: ${percent.toFixed(1)}%`);
    }
  }
);
```

### Error Handling

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';

const extractor = new ArchiveExtractor(logger, fileSystem);

try {
  const result = await extractor.extract(
    '/downloads/tool.tar.gz',
    '/install/tool'
  );
  
  if (!result.success) {
    logger.error('Extraction failed', result.error);
    // Handle extraction failure
  }
} catch (error) {
  logger.error('Unexpected error during extraction', error);
  // Handle unexpected errors
}
```

### Inspecting Extracted Files

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';
import path from 'node:path';

const extractor = new ArchiveExtractor(logger, fileSystem);

const result = await extractor.extract(
  '/downloads/tool.tar.gz',
  '/install/tool'
);

// Find specific files in the extraction result
const binaries = result.extractedFiles.filter(file =>
  path.dirname(file).endsWith('bin')
);

console.log('Found binaries:', binaries);

// Check for specific directory
const hasConfigDir = result.extractedFiles.some(file =>
  file.includes('config')
);
```

## Integration with Installer

The archive extractor is used by the installer package for tool installation:

```typescript
import { ArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';

class Installer {
  constructor(
    private readonly archiveExtractor: IArchiveExtractor,
    // ... other dependencies
  ) {}

  async installTool(downloadPath: string, installDir: string) {
    // Extract downloaded archive
    const extractResult = await this.archiveExtractor.extract(
      downloadPath,
      installDir
    );

    if (!extractResult.success) {
      throw new Error(`Failed to extract: ${extractResult.error}`);
    }

    // Process extracted files
    return extractResult;
  }
}
```

## Extraction Process

### 1. Format Detection
The extractor automatically detects the archive format based on file extension.

### 2. Destination Preparation
Creates the destination directory if it doesn't exist.

### 3. Extraction
Uses appropriate extraction method based on format:
- **Tar archives**: Uses Bun's built-in tar extraction
- **Zip archives**: Uses Bun's built-in unzip functionality

### 4. Result Collection
Collects information about extracted files and directories.

### 5. Error Handling
Captures and reports any extraction errors with context.

## Extract Options

```typescript
interface IExtractOptions {
  /**
   * Callback for progress updates
   */
  onProgress?: (current: number, total: number) => void;
  
  /**
   * Whether to overwrite existing files
   * @default true
   */
  overwrite?: boolean;
}
```

## Error Messages

The extractor provides detailed error messages using structured logging:

```typescript
// Example error messages
'Failed to extract archive: file not found'
'Unsupported archive format: .rar'
'Extraction failed: insufficient permissions'
'Archive appears to be corrupted'
```

## Dependencies

### Internal Dependencies
- `@dotfiles/file-system` - Filesystem operations
- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Type definitions

### External Dependencies
None - uses Bun's built-in archive handling capabilities.

## Testing

Run tests with:
```bash
bun test packages/archive-extractor
```

The package includes tests for:
- All supported archive formats
- Error conditions
- Progress tracking
- File permission handling
- Directory structure preservation

## Logging

The extractor uses structured logging throughout the extraction process:

```typescript
// Log messages are defined in log-messages.ts
logger.debug('Starting extraction', { archivePath, destinationPath });
logger.debug('Extraction completed', { fileCount: result.extractedFiles.length });
logger.error('Extraction failed', { error: extractError });
```

## Performance Considerations

- **Streaming Extraction**: Large archives are extracted incrementally
- **Memory Efficient**: Uses Bun's native extraction without loading entire archives
- **Async Operations**: All operations are async to avoid blocking
- **Progress Callbacks**: Optional to avoid overhead when not needed

## Best Practices

### Always Check Results
```typescript
const result = await extractor.extract(source, dest);
if (!result.success) {
  // Handle failure
  throw new Error(result.error);
}
```

### Use Appropriate Destinations
```typescript
// Create unique destination directories to avoid conflicts
const destDir = path.join(installDir, `tool-${version}`);
await extractor.extract(archivePath, destDir);
```

### Clean Up After Extraction
```typescript
const result = await extractor.extract(downloadPath, installDir);

// After processing, clean up the archive
await fileSystem.remove(downloadPath);
```

### Validate Extracted Contents
```typescript
const result = await extractor.extract(archivePath, installDir);

// Verify expected files exist
const requiredBinary = path.join(result.extractedDir, 'bin', 'tool');
const exists = await fileSystem.exists(requiredBinary);

if (!exists) {
  throw new Error('Required binary not found in archive');
}
```

## Design Decisions

### Why Interface-Based?
The `IArchiveExtractor` interface allows for easy mocking in tests and potential alternative implementations.

### Why Return Detailed Results?
Returning the list of extracted files enables callers to:
- Verify archive contents
- Find specific files
- Track what was installed
- Clean up if needed

### Why Bun-Native?
Using Bun's built-in archive handling provides:
- Better performance
- Reduced dependencies
- Native integration
- Maintained by Bun team

## Future Enhancements

Potential improvements:
- Support for additional formats (.7z, .rar)
- Selective extraction (extract specific files only)
- Archive validation before extraction
- Parallel extraction for large archives
- Extraction to memory for small archives
