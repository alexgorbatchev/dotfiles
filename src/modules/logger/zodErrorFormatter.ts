import type { ZodError } from 'zod';

/**
 * Formats Zod validation errors into an array of log messages.
 * @param error The Zod error object
 * @returns Array of formatted error messages
 */
export function formatZodErrors(error: ZodError): string[] {
  const messages: string[] = [];
  // sort by path length
  const issues = [...error.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);

  // Process each issue
  for (const issue of issues) {
    messages.push(`✖ ${issue.message}`);
    if (issue.path?.length) {
      const dotPath = issue.path.map(String).join('.');
      messages.push(`  → at ${dotPath}`);
    }
  }

  return messages;
}
