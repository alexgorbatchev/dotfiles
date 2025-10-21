import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const httpLogMessages = {
  requestPlanned: (method: string, url: string) => createSafeLogMessage(`HTTP request planned ${method} ${url}`),
  cacheEligible: (namespace: string) => createSafeLogMessage(`HTTP cache eligible namespace ${namespace}`),
  cacheBypassed: (namespace: string, reason: string) =>
    createSafeLogMessage(`HTTP cache bypassed namespace ${namespace}: ${reason}`),
  cacheKeyGenerated: (namespace: string) => createSafeLogMessage(`HTTP cache key generated for namespace ${namespace}`),
  cacheHit: (namespace: string) => createSafeLogMessage(`HTTP cache hit namespace ${namespace}`),
  cacheMiss: (namespace: string) => createSafeLogMessage(`HTTP cache miss namespace ${namespace}`),
  cacheStored: (namespace: string, ttlMs: number) =>
    createSafeLogMessage(`HTTP cache stored namespace ${namespace} ttl ${ttlMs}ms`),
  transportDispatch: (method: string, url: string) => createSafeLogMessage(`HTTP transport dispatch ${method} ${url}`),
  transportResponse: (status: number, url: string) =>
    createSafeLogMessage(`HTTP transport received ${status} from ${url}`),
  responseParsed: (format: string, url: string) => createSafeLogMessage(`HTTP response parsed as ${format} ${url}`),
  schemaValidationFailed: (url: string) => createSafeLogMessage(`HTTP schema validation failed for ${url}`),
  errorTranslated: (kind: string, code?: string) =>
    createSafeLogMessage(`HTTP error translated kind ${kind}${code ? ` code ${code}` : ''}`),
  transportError: (reason: string) => createSafeLogMessage(`HTTP transport error reason ${reason}`),
} satisfies SafeLogMessageMap;
