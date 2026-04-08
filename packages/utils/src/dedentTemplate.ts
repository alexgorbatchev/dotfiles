import { dedentString } from "./dedentString";

/**
 * Processes a standalone placeholder line and returns the processed lines
 */
function processStandalonePlaceholder(
  line: string,
  standalonePlaceholderMatch: RegExpMatchArray,
  values: Record<string, string>,
): string[] {
  const key = standalonePlaceholderMatch[1];

  if (key && key in values) {
    const value = values[key];
    if (value !== undefined) {
      const lineIndent = line.match(/^(\s*)/)?.[1] ?? "";
      const valueLines = value.split("\n");
      return valueLines.map((valueLine: string) => lineIndent + valueLine);
    }
  }

  // Keep the placeholder if no value provided
  return [line];
}

/**
 * Processes inline placeholders within a line
 */
function processInlinePlaceholders(line: string, values: Record<string, string>): string {
  let processedLine = line;
  const placeholderRegex = /{(\w+)}/g;
  let match: RegExpExecArray | null;

  match = placeholderRegex.exec(processedLine);
  while (match !== null) {
    const fullMatch = match[0];
    const key = match[1];

    if (key && key in values) {
      const value = values[key];
      if (value !== undefined) {
        processedLine = processedLine.replace(fullMatch, value);
        placeholderRegex.lastIndex = 0;
      }
    }

    match = placeholderRegex.exec(processedLine);
  }

  return processedLine;
}

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
  const dedentedText = dedentString(template);
  const dedentedLines = dedentedText.split("\n");
  const resultLines: string[] = [];

  for (const line of dedentedLines) {
    const trimmedLine = line.trim();
    const standalonePlaceholderMatch = trimmedLine.match(/^{(\w+)}$/);

    if (standalonePlaceholderMatch) {
      const processedLines = processStandalonePlaceholder(line, standalonePlaceholderMatch, values);
      resultLines.push(...processedLines);
    } else {
      const processedLine = processInlinePlaceholders(line, values);
      resultLines.push(processedLine);
    }
  }

  return resultLines.join("\n");
}
