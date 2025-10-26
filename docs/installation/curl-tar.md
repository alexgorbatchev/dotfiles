# Curl Tar Installation

The `curl-tar` method downloads and extracts tarballs directly from URLs.

## Basic Usage

```typescript
c.install('curl-tar', {
  url: 'https://example.com/tool.tar.gz',
})
```

## Parameters

```typescript
c.install('curl-tar', {
  url: 'https://example.com/tool.tar.gz',  // Required
  extractPath?: 'path/to/binary',          // Optional
  stripComponents?: 1,                     // Optional
})
```

### Parameters

- **`url`**: Direct URL to the tarball to download
- **`extractPath`**: Path to the binary within the extracted archive (optional)
- **`stripComponents`**: Number of directory levels to strip during extraction (optional)

## Examples

### Simple Tarball Download

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
})
```

### With Binary Path

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  extractPath: 'bin/tool',
})
```

### With Strip Components

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  extractPath: 'tool',
  stripComponents: 1,  // Remove top-level directory
})
```

## When to Use Curl Tar

**Best for:**
- Direct tarball downloads from known URLs
- Tools that provide direct download links
- Simple archive structures
- When GitHub releases are not available

**Consider alternatives when:**
- GitHub releases are available (use `github-release` instead)
- Package manager installation is possible
- Complex asset selection is needed
- Version management is required

## How It Works

1. **Download**: Downloads the tarball from the specified URL
2. **Extract**: Extracts the archive to a temporary directory
3. **Binary Location**: Uses `extractPath` to locate the main executable
4. **Installation**: Moves the extracted content to the tool directory
5. **Shim Generation**: Creates shims pointing to the installed binary

## Supported Archive Formats

- `.tar.gz` / `.tgz`
- `.tar.bz2` / `.tbz2`
- `.tar.xz` / `.txz`
- `.tar`

## Complete Example

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('custom-tool')
    .version('1.0.0')
    .install('curl-tar', {
      url: 'https://releases.example.com/custom-tool-v1.0.0.tar.gz',
      extractPath: 'bin/custom-tool',
      stripComponents: 1
    })
    .zsh({
      aliases: {
        'ct': 'custom-tool'
      }
    });
};
```

## Troubleshooting

### Download Fails

**Check URL accessibility:**
```bash
# Test the URL manually
curl -I https://releases.example.com/tool-v1.0.0.tar.gz
```

**Verify SSL certificates:**
- Ensure the URL uses HTTPS with valid certificates
- Check for network restrictions or firewalls

### Extraction Issues

**Check archive format:**
- Verify the file is a valid tarball
- Ensure the format is supported

**Verify extractPath:**
- Check that the binary exists at the specified path within the archive
- Use `tar -tf archive.tar.gz` to list archive contents

### Binary Not Found

**Check stripComponents:**
- Adjust the `stripComponents` value if directory structure is different
- Use 0 to preserve the full directory structure

**Verify extractPath:**
- Ensure the path is relative to the archive root (after stripping components)
- Check for typos in the binary name

## Security Considerations

**Important**: Curl tar downloads execute content from the internet. Only use trusted sources.

**Best practices:**
- Use HTTPS URLs only
- Verify the source is trustworthy
- Consider checksums or signatures when available
- Prefer GitHub releases when possible

## Comparison with Other Methods

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| **curl-tar** | Direct tarball URLs | Simple, direct download | Manual URL management |
| **github-release** | GitHub-hosted tools | Automatic asset selection | GitHub only |
| **curl-script** | Installation scripts | Handles complex setups | Security concerns |

## Next Steps

- [GitHub Release Installation](./github-release.md) - Better option for GitHub-hosted tools
- [Curl Scripts](./curl-script.md) - For installation scripts
- [Manual Installation](./manual.md) - For pre-installed tools