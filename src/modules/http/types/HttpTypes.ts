import type { ZodType } from 'zod';
import type { CacheNamespaceConfig, HttpCacheNamespace } from '../cache/CacheNamespaces';
import type { HttpPipelineErrorCode } from '../errors/ErrorCodes';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type HttpHeaders = Readonly<Record<string, string>>;

export interface HttpTransportRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers?: HttpHeaders;
  readonly body?: BodyInit | null;
  readonly timeoutMs?: number;
}

export interface HttpTransportResponse {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly headers: HttpHeaders;
  readonly body: Uint8Array;
}

export interface HttpClientCachePolicy {
  readonly namespace: HttpCacheNamespace;
  readonly additionalKeyParts?: readonly string[];
}

export interface HttpClientErrorMapping {
  readonly defaultCode?: HttpPipelineErrorCode;
  readonly statusCodeMap?: Partial<Record<number, HttpPipelineErrorCode>>;
  readonly networkErrorCode?: HttpPipelineErrorCode;
  readonly timeoutErrorCode?: HttpPipelineErrorCode;
  readonly schemaErrorCode?: HttpPipelineErrorCode;
}

export interface HttpClientBaseRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers?: HttpHeaders;
  readonly authToken?: string;
  readonly timeoutMs?: number;
  readonly cachePolicy?: HttpClientCachePolicy;
  readonly errorMapping?: HttpClientErrorMapping;
}

export interface HttpClientJsonRequestSpec<TParsed> extends HttpClientBaseRequest {
  readonly responseFormat: 'json';
  readonly schema: ZodType<TParsed>;
}

export interface HttpClientTextRequestSpec extends HttpClientBaseRequest {
  readonly responseFormat: 'text';
}

export interface HttpClientBufferRequestSpec extends HttpClientBaseRequest {
  readonly responseFormat: 'buffer';
}

export type HttpClientRequestSpec<TParsed> =
  | HttpClientJsonRequestSpec<TParsed>
  | HttpClientTextRequestSpec
  | HttpClientBufferRequestSpec;

export interface HttpResponse<TBody> {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly url: string;
  readonly body: TBody;
}

export interface CacheMetadata {
  readonly cachePolicy: HttpClientCachePolicy;
  readonly namespaceConfig: CacheNamespaceConfig;
  readonly cacheKey: string;
}
