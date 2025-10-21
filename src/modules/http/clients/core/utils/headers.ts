import type { HttpHeaders } from '../../../types/HttpTypes';
import { normalizeHeaderName } from './contentType';

export function normalizeHeaders(headers?: HttpHeaders): HttpHeaders {
  if (!headers) {
    return {};
  }

  const entries = Object.entries(headers).map(([key, value]) => [normalizeHeaderName(key), value]);
  return Object.fromEntries(entries);
}

export function getHeader(headers: HttpHeaders, name: string): string | undefined {
  return headers[normalizeHeaderName(name)];
}
