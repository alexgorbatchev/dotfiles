/**
 * Escapes a string so it can be safely used inside a regular expression.
 */
export function escapeRegExp(value: string): string {
  const result: string = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return result;
}
