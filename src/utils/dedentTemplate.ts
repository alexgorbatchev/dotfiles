import { dedentString } from './dedentString';

/**
 * Processes a template string by removing common indentation and replacing placeholders with values.
 *
 * This function:
 * - Removes common leading whitespace using the dedent function
 * - Replaces standalone placeholders (e.g., {key}) with properly indented multiline values
 * - Replaces inline placeholders within text with their corresponding values
 *
 * @param template - The template string containing placeholders in the format {key}
 * @param values - An object mapping placeholder keys to their replacement values
 * @returns The processed string with proper indentation and replaced placeholders
 */
export function dedentTemplate(template: string, values: Record<string, string>): string {
  // First dedent the template
  const dedentedText = dedentString(template);

  // Split into lines for placeholder processing
  const dedentedLines = dedentedText.split('\n');

  // Process all lines and replace placeholders
  const resultLines: string[] = [];

  for (const line of dedentedLines) {
    const trimmedLine = line.trim();

    // Check if the line is a standalone placeholder (e.g., {key})
    const standalonePlaceholderMatch = trimmedLine.match(/^{(\w+)}$/);

    if (standalonePlaceholderMatch) {
      // Handle standalone placeholder (full line)
      const key = standalonePlaceholderMatch[1];

      if (key && key in values) {
        const value = values[key];
        if (value !== undefined) {
          const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';

          // Split value into lines and indent each line
          const valueLines = value.split('\n');
          valueLines.forEach((valueLine: string) => {
            resultLines.push(lineIndent + valueLine);
          });
        }
      } else {
        // Keep the placeholder if no value provided
        resultLines.push(line);
      }
    } else {
      // Handle inline placeholders within text
      let processedLine = line;
      const placeholderRegex = /{(\w+)}/g;
      let match;

      // Replace all placeholders in the line
      while ((match = placeholderRegex.exec(processedLine)) !== null) {
        const fullMatch = match[0];
        const key = match[1];

        if (key && key in values) {
          const value = values[key];
          if (value !== undefined) {
            // For inline placeholders, we don't handle multiline values specially
            // Just replace the placeholder with the value
            processedLine = processedLine.replace(fullMatch, value);

            // Reset regex index since we modified the string
            placeholderRegex.lastIndex = 0;
          }
        }
      }

      resultLines.push(processedLine);
    }
  }

  return resultLines.join('\n');
}
