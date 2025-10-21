export type HttpTransportErrorReason = 'network' | 'timeout';

export interface HttpTransportErrorOptions {
  readonly reason: HttpTransportErrorReason;
  readonly cause?: Error;
}

export class HttpTransportError extends Error {
  readonly reason: HttpTransportErrorReason;
  override readonly cause?: Error;

  constructor(message: string, options: HttpTransportErrorOptions) {
    super(message);
    this.name = 'HttpTransportError';
    this.reason = options.reason;
    this.cause = options.cause;
  }
}
