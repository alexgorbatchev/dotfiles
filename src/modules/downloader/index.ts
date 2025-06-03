/**
 * @file generator/src/modules/downloader/index.ts
 * @description Barrel file for the Downloader module.
 *
 * This module provides interfaces and classes for downloading files,
 * supporting multiple strategies (e.g., Node.js fetch).
 */

export * from './IDownloader';
export * from './DownloadStrategy';
export * from './NodeFetchStrategy';
export * from './Downloader';
