# Homebrew Installation

The `brew` method installs tools using Homebrew package manager on macOS and Linux.

## Basic Usage

```typescript
c.install('brew', {
  formula: 'package-name',
})
```

## Parameters

```typescript
c.install('brew', {
  formula?: 'package-name',     // Optional
  cask?: boolean,              // Optional
  tap?: 'tap-name' | string[], // Optional
})
```

### Parameters

- **`formula`**: Homebrew formula or cask name
- **`cask`**: Set to `true` to install as a cask
- **`tap`**: Required tap(s) to add before installing

## Examples

### Simple Brew Formula

```typescript
c.install('brew', {
  formula: 'ripgrep',
})
```

### Homebrew Cask

```typescript
c.install('brew', {
  formula: 'visual-studio-code',
  cask: true,
})
```

### With Custom Tap

```typescript
c.install('brew', {
  formula: 'aerospace',
  cask: true,
  tap: 'nikitabobko/tap',
})
```

### Multiple Taps

```typescript
c.install('brew', {
  formula: 'custom-tool',
  tap: ['custom/tap', 'another/tap'],
})
```

## When to Use Homebrew

**Advantages:**
- Simple and reliable
- Well-maintained packages
- Automatic dependency management
- Native integration with macOS and Linux

**Disadvantages:**
- Platform-specific (macOS/Linux only)
- Requires Homebrew to be installed
- May not have the latest versions immediately

## Platform Support

Homebrew installation works on:
- **macOS**: Full support for formulas and casks
- **Linux**: Formula support (casks not available)
- **Windows**: Not supported

## Next Steps

- [GitHub Release Installation](./github-release.md) - Cross-platform alternative
- [Cargo Installation](./cargo.md) - For Rust tools
- [Platform Support](../platform-support.md) - Configure platform-specific installations