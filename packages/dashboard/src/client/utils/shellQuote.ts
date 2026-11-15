/** Quote a single argument for the POSIX shells supported by dotfiles. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
