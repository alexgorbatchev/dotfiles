import type { ProjectConfig } from '@dotfiles/config';
import type { ICache } from '@dotfiles/downloader';
import { type IDownloader, NetworkError, NotFoundError } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { CargoClientError } from './CargoClientError';
import type { ICargoClient } from './ICargoClient';
import { messages } from './log-messages';

/**
 * Cargo crate metadata from crates.io API
 */
export interface CrateMetadata {
  crate: {
    name: string;
    newest_version: string;
    repository?: string;
  };
  versions: Array<{
    num: string;
    bin_names?: string[];
  }>;
}

/**
 * Supported cache kinds for Cargo related requests.
 */
type CargoCacheKind = 'cratesIo' | 'githubRaw';

/**
 * Cache options used by requests to determine which host level cache to use.
 */
interface CargoCacheOptions {
  kind: CargoCacheKind;
}

/**
 * Zod schema for validating Cargo.toml package section
 */
const cargoPackageSchema = z.object({
  package: z.object({
    name: z.string(),
    version: z.string(),
    edition: z.string().optional(),
    description: z.string().optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
    repository: z.string().optional(),
    homepage: z.string().optional(),
  }),
});

/**
 * Parsed Cargo.toml package section - derived from Zod schema
 */
export type CargoTomlPackage = z.infer<typeof cargoPackageSchema>['package'];

/**
 * Implements the ICargoClient interface for interacting with Cargo-related APIs.
 *
 * This client handles requests to crates.io API and Cargo.toml file parsing.
 * It delegates all caching to the underlying downloader's CachedDownloadStrategy.
 *
 * ### Caching Strategy
 * The client relies on the downloader's built-in CachedDownloadStrategy for all caching.
 * This provides consistent caching behavior across all HTTP requests in the application.
 *
 * ### Error Handling
 * It translates HTTP errors from the downloader into specific, custom error classes
 * like `NotFoundError` and `RateLimitError`. This allows consumers of the client
 * to handle API errors in a predictable manner.
 */
export class CargoClient implements ICargoClient {
  private readonly downloader: IDownloader;
  private readonly logger: TsLogger;
  private readonly cargoConfig: ProjectConfig['cargo'];
  private readonly cratesIoCache?: ICache;
  private readonly githubRawCache?: ICache;
  private readonly cratesIoCacheEnabled: boolean;
  private readonly cratesIoCacheTtl: number;
  private readonly githubRawCacheEnabled: boolean;
  private readonly githubRawCacheTtl: number;

  constructor(
    parentLogger: TsLogger,
    config: ProjectConfig,
    downloader: IDownloader,
    cratesIoCache?: ICache,
    githubRawCache?: ICache
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'CargoClient' });
    this.downloader = downloader;
    this.cratesIoCache = cratesIoCache;
    this.githubRawCache = githubRawCache;
    this.cargoConfig = config.cargo;

    // Host level cache controls (inherit defaults from schema)
    this.cratesIoCacheEnabled = this.cargoConfig.cratesIo.cache.enabled && Boolean(this.cratesIoCache);
    this.cratesIoCacheTtl = this.cargoConfig.cratesIo.cache.ttl;
    this.githubRawCacheEnabled = this.cargoConfig.githubRaw.cache.enabled && Boolean(this.githubRawCache);
    this.githubRawCacheTtl = this.cargoConfig.githubRaw.cache.ttl;

    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized('CargoClient', this.cargoConfig.userAgent));
  }

  private async request<T>(url: string, cacheOptions?: CargoCacheOptions): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'request' });
    logger.debug(messages.request.makingRequest('GET', url));
    const headers = this.buildRequestHeaders();
    const { useCache, cacheKey, cacheTtl } = this.resolveCacheOptions(url, cacheOptions);
    const cached = await this.tryReadCache<T>(cacheKey, useCache);
    if (cached) {
      return cached;
    }

    const buffer = await this.performDownload(url, headers);
    const data = this.parseJson<T>(buffer, url);
    await this.tryStoreCache(cacheKey, data, cacheTtl, useCache);
    return data;
  }

  private resolveCacheOptions(
    url: string,
    cacheOptions?: CargoCacheOptions
  ): {
    useCache: boolean;
    cacheKey?: string;
    cacheTtl: number;
  } {
    if (!cacheOptions) {
      return { useCache: false, cacheTtl: 0 };
    }
    const kind = cacheOptions.kind;
    const useCache = kind === 'cratesIo' ? this.cratesIoCacheEnabled : this.githubRawCacheEnabled;
    const cacheTtl = kind === 'cratesIo' ? this.cratesIoCacheTtl : this.githubRawCacheTtl;
    const cacheKey = useCache ? `cargo:${kind}:${url}` : undefined;
    return { useCache, cacheKey, cacheTtl };
  }

  private async tryReadCache<T>(cacheKey: string | undefined, useCache: boolean): Promise<T | null> {
    const cacheImpl = cacheKey?.includes('cratesIo:') ? this.cratesIoCache : this.githubRawCache;
    if (!useCache || !cacheKey || !cacheImpl) {
      return null;
    }
    try {
      const cached = await cacheImpl.get<T>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {
      // cache errors are ignored
    }
    return null;
  }

  private async tryStoreCache<T>(cacheKey: string | undefined, data: T, ttl: number, useCache: boolean): Promise<void> {
    const cacheImpl = cacheKey?.includes('cratesIo:') ? this.cratesIoCache : this.githubRawCache;
    if (!useCache || !cacheKey || !cacheImpl) {
      return;
    }
    try {
      await cacheImpl.set(cacheKey, data, ttl);
    } catch {
      // cache errors are ignored
    }
  }

  private parseJson<T>(buffer: Buffer, url: string): T {
    const logger = this.logger.getSubLogger({ name: 'parseJson' });
    if (!buffer || buffer.length === 0) {
      logger.error(messages.errors.emptyResponse(url));
      throw new NetworkError(logger, 'Empty response received from API', url);
    }
    try {
      return JSON.parse(buffer.toString('utf-8')) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(messages.errors.jsonParseError(url), error);
        throw new CargoClientError(`Invalid JSON response from ${url}: ${error.message}`, undefined, error);
      }
      throw error;
    }
  }

  private async performDownload(url: string, headers: Record<string, string>): Promise<Buffer> {
    const logger = this.logger.getSubLogger({ name: 'performDownload' });
    const result = await this.downloader.download(url, { headers });
    if (!result) {
      logger.error(messages.errors.emptyResponse(url));
      throw new NetworkError(logger, 'Empty response received from API', url);
    }
    return result;
  }

  private buildRequestHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': this.cargoConfig.userAgent,
    };
  }

  async getCrateMetadata(crateName: string): Promise<CrateMetadata | null> {
    const logger = this.logger.getSubLogger({ name: 'getCrateMetadata' });
    logger.debug(messages.cratesIo.querying(crateName));
    const url = `${this.cargoConfig.cratesIo.host}/api/v1/crates/${crateName}`;
    try {
      return await this.request<CrateMetadata>(url, { kind: 'cratesIo' });
    } catch (error) {
      if (error instanceof NotFoundError) {
        logger.error(messages.cratesIo.notFound(crateName));
        return null;
      }
      logger.error(messages.cratesIo.metadataError(crateName), error);
      throw error;
    }
  }

  /**
   * Builds a GitHub raw URL for a Cargo.toml file
   */
  buildCargoTomlUrl(githubRepo: string, branch = 'main'): string {
    return `${this.cargoConfig.githubRaw.host}/${githubRepo}/${branch}/Cargo.toml`;
  }

  async getCargoTomlPackage(url: string): Promise<CargoTomlPackage | null> {
    const logger = this.logger.getSubLogger({ name: 'getCargoTomlPackage' });
    logger.debug(messages.parsing.parsingCrateMetadata(url));
    const { useCache, cacheKey } = this.resolveCacheOptions(url, { kind: 'githubRaw' });
    if (useCache) {
      const cached = await this.tryReadCache<CargoTomlPackage>(cacheKey, useCache);
      if (cached) {
        return cached;
      }
    }

    try {
      const responseBuffer = await this.downloader.download(url, { headers: this.buildRequestHeaders() });
      if (!responseBuffer || responseBuffer.length === 0) {
        logger.error(messages.errors.emptyResponse(url));
        return null;
      }
      const pkg = this.parseCargoToml(responseBuffer);
      await this.tryStoreCache(cacheKey, pkg, this.githubRawCacheTtl, useCache);
      return pkg;
    } catch (error) {
      if (error instanceof CargoClientError) {
        throw error;
      }
      if (error instanceof NotFoundError) {
        return null;
      }
      // Let other downloader errors (NetworkError, etc.) bubble up
      logger.error(messages.parsing.cargoTomlParseError(url), error);
      throw error;
    }
  }

  private parseCargoToml(buffer: Buffer): CargoTomlPackage {
    const logger = this.logger.getSubLogger({ name: 'parseCargoToml' });
    const cargoToml = buffer.toString('utf-8');
    const parsed = parse(cargoToml);
    const validationResult = cargoPackageSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.zodErrors(validationResult.error);
      throw new CargoClientError('Could not parse version from Cargo.toml [package] section', undefined);
    }
    return validationResult.data.package;
  }

  async getLatestVersion(crateName: string): Promise<string | null> {
    const metadata = await this.getCrateMetadata(crateName);
    return metadata?.crate.newest_version || null;
  }
}
