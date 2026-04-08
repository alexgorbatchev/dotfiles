/**
 * Convert numeric file permissions to human-readable format
 *
 * @param mode - The numeric mode (e.g., 493, '755', 0o755)
 * @returns Human-readable permission string (e.g., 'rwxr-xr-x')
 */
export function formatPermissions(mode: string | number): string {
  // Convert to number if string
  const numericMode = typeof mode === "string" ? parseInt(mode, 8) : mode;

  // Extract the last 3 digits (file permissions, ignore file type bits)
  const permissions = numericMode & 0o777;

  const chars = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];

  const owner = chars[(permissions >> 6) & 7] ?? "---";
  const group = chars[(permissions >> 3) & 7] ?? "---";
  const other = chars[permissions & 7] ?? "---";

  return owner + group + other;
}
