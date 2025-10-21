import { describe, expect, test } from 'bun:test';
import { setupTestCleanup } from '@rageltd/bun-test-utils';
import type { HttpPipelineErrorKind } from '../HttpPipelineError';
import { deriveRetryHint, HttpPipelineError } from '../HttpPipelineError';

setupTestCleanup();

describe('HttpPipelineError', () => {
  describe('deriveRetryHint', () => {
    test('returns "short" for network errors', () => {
      expect(deriveRetryHint('network')).toBe('short');
    });

    test('returns "none" for 4xx client errors', () => {
      expect(deriveRetryHint('http_client_4xx')).toBe('none');
    });

    test('returns "short" for 5xx server errors', () => {
      expect(deriveRetryHint('http_server_5xx')).toBe('short');
    });

    test('returns "none" for schema validation errors', () => {
      expect(deriveRetryHint('schema')).toBe('none');
    });

    test('returns "long" for rate limit errors', () => {
      expect(deriveRetryHint('rate_limit')).toBe('long');
    });

    test('returns "short" for timeout errors', () => {
      expect(deriveRetryHint('timeout')).toBe('short');
    });

    test('returns "none" for cancelled requests', () => {
      expect(deriveRetryHint('cancel')).toBe('none');
    });

    test('returns "none" for unexpected errors', () => {
      expect(deriveRetryHint('unexpected')).toBe('none');
    });

    test('covers all error kinds', () => {
      const allKinds: HttpPipelineErrorKind[] = [
        'network',
        'http_client_4xx',
        'http_server_5xx',
        'schema',
        'rate_limit',
        'timeout',
        'cancel',
        'unexpected',
      ];

      for (const kind of allKinds) {
        const hint = deriveRetryHint(kind);
        expect(hint).toMatch(/^(none|short|long)$/);
      }
    });
  });

  describe('HttpPipelineError constructor', () => {
    test('creates error with basic properties', () => {
      const error = new HttpPipelineError('Network request failed', {
        kind: 'network',
        errorCode: 'DOWNLOAD_NETWORK_FAILURE',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpPipelineError);
      expect(error.kind).toBe('network');
      expect(error.errorCode).toBe('DOWNLOAD_NETWORK_FAILURE');
      expect(error.message).toBe('Network request failed');
      expect(error.retryHint).toBe('short');
    });

    test('uses provided retryHint over derived hint', () => {
      const error = new HttpPipelineError('Network request failed', {
        kind: 'network',
        errorCode: 'DOWNLOAD_NETWORK_FAILURE',
        retryHint: 'none',
      });

      expect(error.retryHint).toBe('none');
    });

    test('includes optional status code', () => {
      const error = new HttpPipelineError('Release not found', {
        kind: 'http_client_4xx',
        errorCode: 'GITHUB_RELEASE_NOT_FOUND',
        status: 404,
      });

      expect(error.status).toBe(404);
    });

    test('includes optional cause', () => {
      const cause = new Error('Original error');
      const error = new HttpPipelineError('Network request failed', {
        kind: 'network',
        errorCode: 'DOWNLOAD_NETWORK_FAILURE',
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    test('includes optional details', () => {
      const details = {
        type: 'bodyPreview' as const,
        contentType: 'text/plain',
        preview: 'Error message',
        truncated: false,
      };

      const error = new HttpPipelineError('Server error', {
        kind: 'http_server_5xx',
        errorCode: 'DOWNLOAD_NETWORK_FAILURE',
        details,
      });

      expect(error.details).toBe(details);
    });

    test('derives correct retry hints for each kind', () => {
      const testCases: Array<{ kind: HttpPipelineErrorKind; expectedHint: 'none' | 'short' | 'long' }> = [
        { kind: 'network', expectedHint: 'short' },
        { kind: 'http_client_4xx', expectedHint: 'none' },
        { kind: 'http_server_5xx', expectedHint: 'short' },
        { kind: 'schema', expectedHint: 'none' },
        { kind: 'rate_limit', expectedHint: 'long' },
        { kind: 'timeout', expectedHint: 'short' },
        { kind: 'cancel', expectedHint: 'none' },
        { kind: 'unexpected', expectedHint: 'none' },
      ];

      for (const { kind, expectedHint } of testCases) {
        const error = new HttpPipelineError(`Test ${kind} error`, {
          kind,
          errorCode: 'DOWNLOAD_NETWORK_FAILURE',
        });
        expect(error.retryHint).toBe(expectedHint);
      }
    });
  });
});
