import type { ZodError } from "zod";

/**
 * Formats Zod validation errors into an array of human-readable log messages.
 *
 * This function processes a `ZodError` object, sorting the issues by path
 * length and generating a clear, formatted message for each issue.
 *
 * @param error - The `ZodError` object to format.
 * @returns An array of formatted error messages.
 *
 * @example
 * ```typescript
 * import { formatZodErrors } from '@dotfiles/logger';
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * try {
 *   schema.parse({ name: '', email: 'invalid' });
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     const messages = formatZodErrors(error);
 *     messages.forEach(msg => console.error(msg));
 *   }
 * }
 * // Output:
 * // ✖ String must contain at least 1 character(s)
 * //   → at name
 * // ✖ Invalid email
 * //   → at email
 * ```
 *
 * @internal
 */
export function formatZodErrors(error: ZodError): string[] {
  const messages: string[] = [];
  // sort by path length
  const issues = [...error.issues].toSorted((a, b) => (a.path ?? []).length - (b.path ?? []).length);

  // Process each issue
  for (const issue of issues) {
    messages.push(`✖ ${issue.message}`);
    if (issue.path?.length) {
      const dotPath = issue.path.map(String).join(".");
      messages.push(`  → at ${dotPath}`);
    }
  }

  return messages;
}
