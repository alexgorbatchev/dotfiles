import type { HttpPipelineErrorCode } from './ErrorCodes';
import type { HttpPipelineErrorDetails } from './ErrorDetails';

export type HttpPipelineErrorKind =
  | 'network'
  | 'http_client_4xx'
  | 'http_server_5xx'
  | 'schema'
  | 'rate_limit'
  | 'timeout'
  | 'cancel'
  | 'unexpected';

export type RetryHint = 'none' | 'short' | 'long';

export interface HttpPipelineErrorOptions {
  readonly kind: HttpPipelineErrorKind;
  readonly status?: number;
  readonly errorCode?: HttpPipelineErrorCode;
  readonly retryHint?: RetryHint;
  readonly cause?: Error;
  readonly details?: HttpPipelineErrorDetails;
}

export interface BaseHttpPipelineError extends Error {
  readonly kind: HttpPipelineErrorKind;
  readonly status?: number;
  readonly errorCode?: HttpPipelineErrorCode;
  readonly retryHint: RetryHint;
  readonly cause?: Error;
  readonly details?: HttpPipelineErrorDetails;
}

const retryHintByKind: Record<HttpPipelineErrorKind, RetryHint> = {
  network: 'short',
  timeout: 'short',
  http_server_5xx: 'short',
  rate_limit: 'long',
  http_client_4xx: 'none',
  schema: 'none',
  cancel: 'none',
  unexpected: 'none',
};

export function deriveRetryHint(kind: HttpPipelineErrorKind): RetryHint {
  return retryHintByKind[kind];
}

export class HttpPipelineError extends Error implements BaseHttpPipelineError {
  readonly kind: HttpPipelineErrorKind;
  readonly status?: number;
  readonly errorCode?: HttpPipelineErrorCode;
  readonly retryHint: RetryHint;
  override readonly cause?: Error;
  readonly details?: HttpPipelineErrorDetails;

  constructor(message: string, options: HttpPipelineErrorOptions) {
    super(message);
    this.name = 'HttpPipelineError';
    this.kind = options.kind;
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.retryHint = options.retryHint ?? deriveRetryHint(options.kind);
    this.cause = options.cause;
    this.details = options.details;
  }
}
