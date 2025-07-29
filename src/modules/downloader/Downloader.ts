import type { IDownloader, DownloadOptions } from './IDownloader';
import type { DownloadStrategy } from './DownloadStrategy';
import { NodeFetchStrategy } from './NodeFetchStrategy';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';

export class Downloader implements IDownloader {
  private strategies: DownloadStrategy[] = [];
  private fs: IFileSystem;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, strategies?: DownloadStrategy[]) {
    this.logger = parentLogger.getSubLogger({ name: 'Downloader' });
    this.fs = fileSystem;
    if (typeof strategies !== 'undefined') {
      this.strategies = strategies;
    } else {
      this.strategies.push(new NodeFetchStrategy(this.logger, this.fs));
    }
  }

  public registerStrategy(strategy: DownloadStrategy): void {
    this.strategies.unshift(strategy);
  }

  public async download(url: string, options: DownloadOptions = {}): Promise<Buffer | void> {
    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) {
        try {
          return await strategy.download(url, options);
        } catch (error) {
          if (error instanceof Error) {
            lastError = error;
          } else if (typeof error === 'string') {
            lastError = new Error(error);
          } else {
            lastError = new Error(`An unknown error occurred during download: ${JSON.stringify(error)}`);
          }
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`No available download strategy succeeded for ${url}.`);
  }
}
