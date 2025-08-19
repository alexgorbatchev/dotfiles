# GitHub Release Installation

The `github-release` method downloads and installs tools from GitHub releases, automatically selecting the appropriate asset for your platform.

## Basic Usage

```typescript
c.install('github-release', {
  repo: 'owner/repository',
})
```

## Parameters

```typescript
c.install('github-release', {
  repo: 'owner/repository',                    // Required
  assetPattern?: 'pattern',                    // Optional
  binaryPath?: 'path/within/archive',          // Optional  
  version?: 'v1.2.3',                         // Optional
  includePrerelease?: false,                   // Optional
  stripComponents?: 1,                         // Optional
  assetSelector?: (assets, sysInfo) => asset, // Optional
})
```

### Required Parameters

- **`repo`**: GitHub repository in "owner/repo" format

### Optional Parameters

- **`assetPattern`**: Glob pattern or regex to match release assets
  ```typescript
  assetPattern: '*linux_amd64.tar.gz'
  assetPattern: 'tool-*-darwin-arm64.tar.gz'
  ```

- **`binaryPath`**: Path to executable **relative to extracted archive root**
  ```typescript
  binaryPath: 'bin/tool'           // Binary located at bin/tool inside extracted archive
  binaryPath: 'tool'               // Binary located at archive root
  binaryPath: 'dist/linux/tool'   // Binary located at dist/linux/tool inside archive
  ```
  This path is used to generate shims that point to the binary at its original location within the extracted archive.

- **`stripComponents`**: Number of directory levels to strip during extraction (like tar --strip-components)

- **`assetSelector`**: Custom function to select the correct asset

## Examples

### Simple GitHub Release

```typescript
c.install('github-release', {
  repo: 'junegunn/fzf',
})
```

### Complex GitHub Release with Pattern Matching

```typescript
c.install('github-release', {
  repo: 'sharkdp/bat',
  assetPattern: '*linux_amd64.tar.gz',
})
```

### Using Custom Asset Selector

```typescript
c.install('github-release', {
  repo: 'example/tool',
  assetSelector: (assets, sysInfo) => {
    const platformKey = sysInfo.platform === 'darwin' ? 'macos' : sysInfo.platform;
    const archKey = sysInfo.arch === 'arm64' ? 'aarch64' : sysInfo.arch;
    return assets.find(asset => 
      asset.name.includes(platformKey) && asset.name.includes(archKey)
    );
  }
})
```

### Specific Version

```typescript
c.install('github-release', {
  repo: 'owner/tool',
  version: 'v2.1.0',
  assetPattern: '*linux*.tar.gz',
})
```

## How It Works

1. **Release Discovery**: Queries GitHub API for releases
2. **Asset Selection**: Uses pattern matching or custom selector to find the right asset
3. **Download**: Downloads the selected asset with caching
4. **Extraction**: Extracts archive to versioned directory
5. **Binary Location**: Identifies executable using `binaryPath`
6. **Shim Generation**: Creates shims that point to the binary in its extracted location

## Platform Detection

The system automatically detects your platform and architecture:

- **Platform**: `darwin`, `linux`, `win32`
- **Architecture**: `x64`, `arm64`

These values are available in custom asset selectors as `sysInfo.platform` and `sysInfo.arch`.

## Asset Pattern Matching

Asset patterns support glob-style matching:

- `*` matches any characters
- `?` matches single character
- `[abc]` matches any character in brackets
- `{a,b}` matches either a or b

Common patterns:
```typescript
'*linux*amd64*.tar.gz'     // Linux x64 tarballs
'*darwin*arm64*.zip'       // macOS ARM64 zip files
'*windows*.exe'            // Windows executables
```

## Troubleshooting

**Asset not found**: Check the actual asset names in the GitHub release and adjust your pattern.

**Wrong binary selected**: Verify the `binaryPath` points to the correct executable within the extracted archive.

**Platform detection issues**: Use a custom `assetSelector` for complex platform naming schemes.

## Next Steps

- [Homebrew Installation](./homebrew.md) - Alternative for package manager installation
- [Shell Integration](../shell-integration.md) - Configure shell environment after installation
- [Completions](../completions.md) - Set up command completions