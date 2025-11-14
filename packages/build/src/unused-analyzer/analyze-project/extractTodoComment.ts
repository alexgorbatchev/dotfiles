import type { PropertyDeclaration, PropertySignature } from 'ts-morph';

/**
 * Extracts TODO comment text from the leading comments of a property.
 * Returns undefined if no TODO comment is found.
 */
export function extractTodoComment(prop: PropertySignature | PropertyDeclaration): string | undefined {
  const leadingComments = prop.getLeadingCommentRanges();

  for (const comment of leadingComments) {
    const commentText: string = comment.getText();

    // Match single-line comments: // TODO ...
    const singleLineMatch = commentText.match(/\/\/\s*TODO\s+(.+)/i);
    if (singleLineMatch) {
      const todoText: string | undefined = singleLineMatch[1];
      if (todoText) {
        return todoText.trim();
      }
    }

    // Match multi-line comments: /* TODO ... */ or /** TODO ... */
    const multiLineMatch = commentText.match(/\/\*+\s*TODO\s+(.+?)\*\//is);
    if (multiLineMatch) {
      const todoText: string | undefined = multiLineMatch[1];
      if (todoText) {
        return todoText.trim().replace(/\s+/g, ' ');
      }
    }
  }

  return undefined;
}
