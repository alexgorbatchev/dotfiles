import type { YamlConfig } from '@modules/config';
import { type IDownloader, NetworkError, NotFoundError } from '@modules/downloader';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { CargoClientError } from './CargoClientError';
import type { ICargoClient } from './ICargoClient';

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
  private readonly userAgent: string;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, config: YamlConfig, downloader: IDownloader) {
    this.logger = parentLogger.getSubLogger({ name: 'CargoClient' });
    this.downloader = downloader;
    this.userAgent = config.github.userAgent; // Reuse GitHub user agent

    this.logger.debug(logs.cargoClient.debug.constructorInit(), 'CargoClient', this.userAgent);
  }

  private async request<T>(url: string): Promise<T> {
    this.logger.debug(logs.cargoClient.debug.makingRequest(), 'GET', url);
    const headers = this.buildRequestHeaders();

    try {
      const responseBuffer = await this.downloader.download(url, { headers });
      if (!responseBuffer || responseBuffer.length === 0) {
        this.logger.debug(logs.cargoClient.debug.emptyResponse(), url);
        throw new NetworkError(this.logger, 'Empty response received from API', url);
      }
      const responseText = responseBuffer.toString('utf-8');
      return JSON.parse(responseText) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.logger.debug(logs.cargoClient.debug.jsonParseError(), url, error.message);
        throw new CargoClientError(`Invalid JSON response from ${url}: ${error.message}`, undefined, error);
      }
      // Let all downloader errors (NetworkError, NotFoundError, etc.) bubble up
      throw error;
    }
  }

  private buildRequestHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
  }

  async getCrateMetadata(crateName: string): Promise<CrateMetadata | null> {
    this.logger.debug(logs.cargoClient.debug.queryingCratesIo(), crateName);
    try {
      const url = `https://crates.io/api/v1/crates/${crateName}`;
      return await this.request<CrateMetadata>(url);
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.logger.debug(logs.cargoClient.debug.crateNotFound(), crateName);
        return null;
      }
      this.logger.debug(logs.cargoClient.debug.crateMetadataError(), crateName, (error as Error).message);
      throw error;
    }
  }

  async getCargoTomlPackage(url: string): Promise<CargoTomlPackage | null> {
    this.logger.debug(logs.cargoClient.debug.parsingCrateMetadata(), url);
    try {
      const responseBuffer = await this.downloader.download(url, { headers: this.buildRequestHeaders() });
      if (!responseBuffer || responseBuffer.length === 0) {
        this.logger.debug(logs.cargoClient.debug.emptyResponse(), url);
        return null;
      }

      const cargoToml = responseBuffer.toString('utf-8');
      const parsed = parse(cargoToml);
      const validationResult = cargoPackageSchema.safeParse(parsed);

      if (!validationResult.success) {
        this.logger.zodErrors(validationResult.error);
        throw new CargoClientError('Could not parse version from Cargo.toml [package] section', undefined);
      }

      return validationResult.data.package;
    } catch (error) {
      if (error instanceof CargoClientError) {
        throw error;
      }
      if (error instanceof NotFoundError) {
        return null;
      }
      // Let other downloader errors (NetworkError, etc.) bubble up
      this.logger.debug(logs.cargoClient.debug.cargoTomlParseError(), url, (error as Error).message);
      throw error;
    }
  }

  async getLatestVersion(crateName: string): Promise<string | null> {
    const metadata = await this.getCrateMetadata(crateName);
    return metadata?.crate.newest_version || null;
  }
}
