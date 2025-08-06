/**
 * Strips common leading whitespace from all lines in a string.
 * This is useful for cleaning up template literals that are indented for readability.
 * 
 * @param str - The string to dedent
 * @returns The dedented string with common leading whitespace removed
 * 
 * @example
 * ```typescript
 * const indented = `
 *   function hello() {
 *     echo "Hello World"
 *   }
 * `;
 * 
 * const dedented = dedentString(indented);
 * // Result:
 * // function hello() {
 * //   echo "Hello World"
 * // }
 * ```
 */
export function dedentString(str: string): string {
  const lines = str.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  
  if (nonEmptyLines.length === 0) {
    return str;
  }
  
  // Find the minimum indentation level among non-empty lines
  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => line.match(/^ */)?.[0].length ?? 0)
  );
  
  // Remove the common indentation from all lines
  return lines
    .map((line) => line.slice(minIndent))
    .join('\n')
    .trim(); // Remove leading/trailing empty lines
}