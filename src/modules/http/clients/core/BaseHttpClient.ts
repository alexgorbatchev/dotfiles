import type { TsLogger } from '@modules/logger';
import type { CacheNamespaceConfig } from '../../cache/CacheNamespaces';
import { getCacheNamespaceConfig } from '../../cache/CacheNamespaces';
import type { HttpCache } from '../../cache/HttpCache';
import type { HttpPipelineErrorCode } from '../../errors/ErrorCodes';
import type { BodyPreviewDetails, GitHubRateLimitDetails } from '../../errors/ErrorDetails';
import { HttpPipelineError } from '../../errors/HttpPipelineError';
import { HttpTransportError } from '../../errors/HttpTransportError';
import type { HttpTransport } from '../../types/HttpTransport';
import type {
  CacheMetadata,
  HttpClientBufferRequestSpec,
  HttpClientCachePolicy,
  HttpClientJsonRequestSpec,
  HttpClientRequestSpec,
  HttpClientTextRequestSpec,
  HttpHeaders,
  HttpResponse,
  HttpTransportRequest,
  HttpTransportResponse,
} from '../../types/HttpTypes';
import { httpLogMessages } from './log-messages';
import { isTextualContentType, normalizeHeaderName, parseCharset } from './utils/contentType';
import { sha256 } from './utils/crypto';
import { getHeader } from './utils/headers';

const BODY_PREVIEW_BYTE_LIMIT = 128;

interface BaseHttpClientOptions {
  readonly transport: HttpTransport;
  readonly logger: TsLogger;
  readonly cache?: HttpCache;
  readonly cacheEnabled: boolean;
}

interface HttpResponseCacheEntry<TBody> {
  readonly format: 'json' | 'text' | 'buffer';
  readonly response: HttpResponse<TBody>;
}

export class BaseHttpClient {
  private readonly transport: HttpTransport;
  private readonly logger: TsLogger;
  private readonly cache?: HttpCache;
  private readonly cacheEnabled: boolean;

  constructor(options: BaseHttpClientOptions) {
    this.transport = options.transport;
    this.logger = options.logger.getSubLogger({ name: 'BaseHttpClient' });
    this.cache = options.cache;
    this.cacheEnabled = options.cacheEnabled;
  }

  async request<TParsed>(spec: HttpClientJsonRequestSpec<TParsed>): Promise<HttpResponse<TParsed>>;
  async request(spec: HttpClientTextRequestSpec): Promise<HttpResponse<string>>;
  async request(spec: HttpClientBufferRequestSpec): Promise<HttpResponse<Uint8Array>>;
  async request<TParsed>(spec: HttpClientRequestSpec<TParsed>): Promise<HttpResponse<unknown>> {
    const logger = this.logger.getSubLogger({ name: 'request' });
    logger.debug(httpLogMessages.requestPlanned(spec.method, spec.url));

    const cacheMetadata = this.resolveCacheMetadata(spec);

    if (spec.responseFormat === 'json') {
      return await this.processJsonRequest(spec, cacheMetadata);
    }

    if (spec.responseFormat === 'text') {
      return await this.processTextRequest(spec, cacheMetadata);
    }

    return await this.processBufferRequest(spec, cacheMetadata);
  }

  private async processJsonRequest<TParsed>(
    spec: HttpClientJsonRequestSpec<TParsed>,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<TParsed>> {
    if (cacheMetadata) {
      const cached = await this.tryReadCache<TParsed>(cacheMetadata, spec);
      if (cached) {
        return cached;
      }
    }

    const transportResponse = await this.dispatch(spec);
    if (transportResponse.status >= 200 && transportResponse.status < 300) {
      return await this.handleJsonSuccess(spec, transportResponse, cacheMetadata);
    }

    throw this.translateError(spec, transportResponse);
  }

  private async processTextRequest(
    spec: HttpClientTextRequestSpec,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<string>> {
    if (cacheMetadata) {
      const cached = await this.tryReadCache<string>(cacheMetadata, spec);
      if (cached) {
        return cached;
      }
    }

    const transportResponse = await this.dispatch(spec);
    if (transportResponse.status >= 200 && transportResponse.status < 300) {
      return await this.handleTextSuccess(transportResponse, cacheMetadata);
    }

    throw this.translateError(spec, transportResponse);
  }

  private async processBufferRequest(
    spec: HttpClientBufferRequestSpec,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<Uint8Array>> {
    if (cacheMetadata) {
      const cached = await this.tryReadCache<Uint8Array>(cacheMetadata, spec);
      if (cached) {
        return cached;
      }
    }

    const transportResponse = await this.dispatch(spec);
    if (transportResponse.status >= 200 && transportResponse.status < 300) {
      return await this.handleBufferSuccess(transportResponse, cacheMetadata);
    }

    throw this.translateError(spec, transportResponse);
  }

  private resolveCacheMetadata<TParsed>(spec: HttpClientRequestSpec<TParsed>): CacheMetadata | undefined {
    const logger = this.logger.getSubLogger({ name: 'resolveCacheMetadata' });

    if (!this.cache) {
      return undefined;
    }

    if (!this.cacheEnabled) {
      if (spec.cachePolicy) {
        logger.debug(httpLogMessages.cacheBypassed(spec.cachePolicy.namespace, 'cache-disabled'));
      }
      return undefined;
    }

    if (!spec.cachePolicy) {
      return undefined;
    }

    if (spec.method !== 'GET') {
      logger.debug(httpLogMessages.cacheBypassed(spec.cachePolicy.namespace, 'method')); // Non-GET methods bypass cache
      return undefined;
    }

    const namespaceConfig = getCacheNamespaceConfig(spec.cachePolicy.namespace);
    if (!namespaceConfig.cacheable) {
      logger.debug(httpLogMessages.cacheBypassed(namespaceConfig.name, 'namespace')); // Namespace not cacheable
      return undefined;
    }

    logger.debug(httpLogMessages.cacheEligible(namespaceConfig.name));
    const cacheKey = this.createCacheKey(
      spec.cachePolicy,
      namespaceConfig,
      spec.authToken ?? null,
      spec.method,
      spec.url
    );
    logger.debug(httpLogMessages.cacheKeyGenerated(namespaceConfig.name));

    return {
      cachePolicy: spec.cachePolicy,
      namespaceConfig,
      cacheKey,
    } satisfies CacheMetadata;
  }

  private async tryReadCache<TParsed>(
    metadata: CacheMetadata,
    spec: HttpClientRequestSpec<TParsed>
  ): Promise<HttpResponse<TParsed> | undefined> {
    const logger = this.logger.getSubLogger({ name: 'tryReadCache' });
    const entry = await this.cache?.get<HttpResponseCacheEntry<TParsed>>(metadata.cacheKey);
    if (!entry) {
      logger.debug(httpLogMessages.cacheMiss(metadata.cachePolicy.namespace));
      return undefined;
    }

    if (entry.format !== spec.responseFormat) {
      logger.debug(httpLogMessages.cacheBypassed(metadata.cachePolicy.namespace, 'format-mismatch'));
      return undefined;
    }

    logger.debug(httpLogMessages.cacheHit(metadata.cachePolicy.namespace));
    return entry.response;
  }

  private async dispatch<TParsed>(spec: HttpClientRequestSpec<TParsed>): Promise<HttpTransportResponse> {
    const logger = this.logger.getSubLogger({ name: 'dispatch' });
    try {
      logger.debug(httpLogMessages.transportDispatch(spec.method, spec.url));
      const transportRequest: HttpTransportRequest = {
        method: spec.method,
        url: spec.url,
        headers: this.normalizeRequestHeaders(spec.headers),
        timeoutMs: spec.timeoutMs,
        body: undefined,
      };
      const response = await this.transport.execute(transportRequest);
      logger.debug(httpLogMessages.transportResponse(response.status, response.url));
      return response;
    } catch (error) {
      logger.debug(httpLogMessages.transportError(error instanceof HttpTransportError ? error.reason : 'unknown'));
      throw this.translateTransportError(spec, error);
    }
  }

  private normalizeRequestHeaders(headers?: HttpHeaders): HttpHeaders {
    if (!headers) {
      return {};
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[normalizeHeaderName(key)] = value;
    }
    return normalized;
  }

  private async handleJsonSuccess<TParsed>(
    spec: HttpClientJsonRequestSpec<TParsed>,
    transportResponse: HttpTransportResponse,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<TParsed>> {
    const logger = this.logger.getSubLogger({ name: 'handleJsonSuccess' });
    const body = this.parseJsonResponse(spec, transportResponse);
    const response: HttpResponse<TParsed> = {
      status: transportResponse.status,
      headers: transportResponse.headers,
      url: transportResponse.url,
      body,
    };
    await this.tryWriteCache(cacheMetadata, response, 'json');
    logger.debug(httpLogMessages.responseParsed('json', transportResponse.url));
    return response;
  }

  private async handleTextSuccess(
    transportResponse: HttpTransportResponse,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<string>> {
    const logger = this.logger.getSubLogger({ name: 'handleTextSuccess' });
    const body = this.parseTextResponse(transportResponse);
    const response: HttpResponse<string> = {
      status: transportResponse.status,
      headers: transportResponse.headers,
      url: transportResponse.url,
      body,
    };
    await this.tryWriteCache(cacheMetadata, response, 'text');
    logger.debug(httpLogMessages.responseParsed('text', transportResponse.url));
    return response;
  }

  private async handleBufferSuccess(
    transportResponse: HttpTransportResponse,
    cacheMetadata: CacheMetadata | undefined
  ): Promise<HttpResponse<Uint8Array>> {
    const logger = this.logger.getSubLogger({ name: 'handleBufferSuccess' });
    const body = this.parseBufferResponse(transportResponse);
    const response: HttpResponse<Uint8Array> = {
      status: transportResponse.status,
      headers: transportResponse.headers,
      url: transportResponse.url,
      body,
    };
    await this.tryWriteCache(cacheMetadata, response, 'buffer');
    logger.debug(httpLogMessages.responseParsed('buffer', transportResponse.url));
    return response;
  }

  private parseJsonResponse<TParsed>(
    spec: HttpClientJsonRequestSpec<TParsed>,
    transportResponse: HttpTransportResponse
  ): TParsed {
    const logger = this.logger.getSubLogger({ name: 'parseJsonResponse' });
    const contentType = getHeader(transportResponse.headers, 'content-type');
    const charset = parseCharset(contentType);
    let text: string;

    try {
      const decoder = new TextDecoder(charset, { fatal: false });
      text = decoder.decode(transportResponse.body);
    } catch (error) {
      throw new HttpPipelineError('Failed to decode HTTP JSON response body', {
        kind: 'unexpected',
        cause: error instanceof Error ? error : new Error('Unknown decode error'),
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new HttpPipelineError('Failed to parse HTTP JSON response body', {
        kind: 'schema',
        errorCode: spec.errorMapping?.schemaErrorCode,
        cause: error instanceof Error ? error : new Error('Unknown JSON parse error'),
      });
    }

    const result = spec.schema.safeParse(parsed);
    if (!result.success) {
      logger.debug(httpLogMessages.schemaValidationFailed(transportResponse.url));
      logger.zodErrors(result.error);
      throw new HttpPipelineError('HTTP JSON response schema validation failed', {
        kind: 'schema',
        errorCode: spec.errorMapping?.schemaErrorCode,
        cause: result.error,
      });
    }

    return result.data;
  }

  private parseTextResponse(transportResponse: HttpTransportResponse): string {
    const contentType = getHeader(transportResponse.headers, 'content-type');
    const charset = parseCharset(contentType);
    const decoder = new TextDecoder(charset, { fatal: false });
    return decoder.decode(transportResponse.body);
  }

  private parseBufferResponse(transportResponse: HttpTransportResponse): Uint8Array {
    return transportResponse.body;
  }

  private async tryWriteCache<TBody>(
    metadata: CacheMetadata | undefined,
    response: HttpResponse<TBody>,
    format: HttpResponseCacheEntry<TBody>['format']
  ): Promise<void> {
    if (!metadata || !this.cache) {
      return;
    }

    const logger = this.logger.getSubLogger({ name: 'tryWriteCache' });

    if (metadata.namespaceConfig.ttlMs <= 0) {
      logger.debug(httpLogMessages.cacheBypassed(metadata.cachePolicy.namespace, 'ttl'));
      return;
    }

    const entry: HttpResponseCacheEntry<TBody> = {
      format,
      response,
    };

    await this.cache.set(metadata.cacheKey, entry, metadata.namespaceConfig.ttlMs);
    logger.debug(httpLogMessages.cacheStored(metadata.cachePolicy.namespace, metadata.namespaceConfig.ttlMs));
  }

  private translateTransportError<TParsed>(spec: HttpClientRequestSpec<TParsed>, error: unknown): HttpPipelineError {
    if (error instanceof HttpTransportError) {
      if (error.reason === 'timeout') {
        return new HttpPipelineError(`HTTP request timed out for ${spec.url}`, {
          kind: 'timeout',
          errorCode: spec.errorMapping?.timeoutErrorCode,
          cause: error,
        });
      }

      return new HttpPipelineError(`HTTP transport failed for ${spec.url}`, {
        kind: 'network',
        errorCode: spec.errorMapping?.networkErrorCode,
        cause: error,
      });
    }

    return new HttpPipelineError(`Unexpected HTTP transport error for ${spec.url}`, {
      kind: 'unexpected',
      cause: error instanceof Error ? error : new Error('Unknown transport error'),
    });
  }

  private translateError<TParsed>(
    spec: HttpClientRequestSpec<TParsed>,
    transportResponse: HttpTransportResponse
  ): HttpPipelineError {
    const logger = this.logger.getSubLogger({ name: 'translateError' });
    const status = transportResponse.status;
    const headers = transportResponse.headers;
    const contentType = getHeader(headers, 'content-type');
    const bodyPreview = this.buildBodyPreview(contentType, transportResponse.body);

    const rateLimitDetails = this.extractRateLimitDetails(headers);
    const errorCode = this.resolveErrorCode(spec, status);

    if (rateLimitDetails) {
      logger.debug(httpLogMessages.errorTranslated('rate_limit', errorCode));
      return new HttpPipelineError(`HTTP rate limit reached for ${spec.url}`, {
        kind: 'rate_limit',
        status,
        errorCode: errorCode ?? spec.errorMapping?.defaultCode,
        details: rateLimitDetails,
      });
    }

    if (status === 408) {
      logger.debug(httpLogMessages.errorTranslated('timeout', errorCode));
      return new HttpPipelineError(`HTTP request timed out for ${spec.url}`, {
        kind: 'timeout',
        status,
        errorCode: errorCode ?? spec.errorMapping?.timeoutErrorCode,
        details: bodyPreview,
      });
    }

    if (status >= 500) {
      logger.debug(httpLogMessages.errorTranslated('http_server_5xx', errorCode));
      return new HttpPipelineError(`HTTP server error ${status} for ${spec.url}`, {
        kind: 'http_server_5xx',
        status,
        errorCode: errorCode ?? spec.errorMapping?.defaultCode,
        details: bodyPreview,
      });
    }

    if (status >= 400) {
      logger.debug(httpLogMessages.errorTranslated('http_client_4xx', errorCode));
      return new HttpPipelineError(`HTTP client error ${status} for ${spec.url}`, {
        kind: 'http_client_4xx',
        status,
        errorCode: errorCode ?? spec.errorMapping?.defaultCode,
        details: bodyPreview,
      });
    }

    logger.debug(httpLogMessages.errorTranslated('unexpected', errorCode));
    return new HttpPipelineError(`Unexpected HTTP response ${status} for ${spec.url}`, {
      kind: 'unexpected',
      status,
      errorCode: errorCode ?? spec.errorMapping?.defaultCode,
      details: bodyPreview,
    });
  }

  private resolveErrorCode<TParsed>(
    spec: HttpClientRequestSpec<TParsed>,
    status: number
  ): HttpPipelineErrorCode | undefined {
    const mapping = spec.errorMapping;
    if (!mapping) {
      return undefined;
    }

    const specific = mapping.statusCodeMap?.[status];
    if (specific) {
      return specific;
    }

    return mapping.defaultCode;
  }

  private buildBodyPreview(contentType: string | undefined, body: Uint8Array): BodyPreviewDetails | undefined {
    if (!isTextualContentType(contentType)) {
      return undefined;
    }

    const previewBytes = body.slice(0, Math.min(body.length, BODY_PREVIEW_BYTE_LIMIT));
    const decoder = new TextDecoder(parseCharset(contentType), { fatal: false });
    const previewText = decoder.decode(previewBytes);

    return {
      type: 'bodyPreview',
      contentType: contentType ?? 'unknown',
      preview: previewText,
      truncated: body.length > previewBytes.length,
    };
  }

  private extractRateLimitDetails(headers: HttpHeaders): GitHubRateLimitDetails | undefined {
    const limit = this.parseHeaderInt(headers, 'x-ratelimit-limit');
    const remaining = this.parseHeaderInt(headers, 'x-ratelimit-remaining');
    const reset = this.parseHeaderInt(headers, 'x-ratelimit-reset');
    const resource = getHeader(headers, 'x-ratelimit-resource');

    if (limit === undefined && remaining === undefined && reset === undefined) {
      return undefined;
    }

    return {
      type: 'githubRateLimit',
      limit,
      remaining,
      resetAt: reset,
      resource,
    };
  }

  private parseHeaderInt(headers: HttpHeaders, name: string): number | undefined {
    const value = getHeader(headers, name);
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private createCacheKey(
    policy: HttpClientCachePolicy,
    namespaceConfig: CacheNamespaceConfig,
    authToken: string | null,
    method: string,
    url: string
  ): string {
    const parts: string[] = [namespaceConfig.name, method.toUpperCase(), url];
    if (policy.additionalKeyParts) {
      parts.push(...policy.additionalKeyParts);
    }

    const shouldIncludeAuthHash =
      namespaceConfig.varyByAuthStrategy === 'always' || (namespaceConfig.varyByAuthStrategy === 'auto' && authToken);

    if (shouldIncludeAuthHash && authToken) {
      parts.push(sha256(authToken));
    }

    return sha256(parts.join('|'));
  }
}
