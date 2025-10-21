export function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

export function isTextualContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return normalized.startsWith('text/') || normalized.includes('application/json');
}

export function parseCharset(contentType: string | undefined): string {
  if (!contentType) {
    return 'utf-8';
  }

  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charsetValue = charsetMatch?.[1];
  return charsetValue ? charsetValue.trim().toLowerCase() : 'utf-8';
}
