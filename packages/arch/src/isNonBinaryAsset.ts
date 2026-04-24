/**
 * Patterns for non-binary files that should be excluded from asset selection.
 * Based on zinit's junk filtering logic and extended for package-manager artifacts
 * that should not be treated as portable release binaries.
 */
const NON_BINARY_PATTERNS: RegExp[] = [
  // Checksum files
  /\.sha\d+(sum)?$/i,
  /\.md5(sum)?$/i,
  /\.sum$/i,
  /^shasums/i,
  // Signature files
  /\.sig$/i,
  /\.asc$/i,
  /\.pem$/i,
  // Metadata files
  /\.json$/i,
  /\.txt$/i,
  /\.sbom$/i,
  // Package formats (not portable binaries)
  /\.deb$/i,
  /\.rpm$/i,
  /\.apk$/i,
  /\.flatpak$/i,
  /\.pkg$/i,
  // Build artifacts
  /buildable-artifact/i,
  /\.vsix$/i,
  // Other non-binary formats
  /\.b3$/i,
  /\.zst$/i,
];

export function isNonBinaryAsset(assetName: string): boolean {
  return NON_BINARY_PATTERNS.some((pattern) => pattern.test(assetName));
}
