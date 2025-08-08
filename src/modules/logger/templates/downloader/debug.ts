import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const downloaderDebugTemplates = {
  constructorDebug: (): SafeLogMessage => 
    createSafeLogMessage('fileSystem=%o, config=%o'),
  downloadDebug: (): SafeLogMessage => 
    createSafeLogMessage('url=%s, destination=%s, options=%o'),
  downloadStart: (): SafeLogMessage => 
    createSafeLogMessage('Starting download: %s'),
  downloadProgress: (): SafeLogMessage => 
    createSafeLogMessage('Download progress: %d%% (%d/%d bytes)'),
  downloadComplete: (): SafeLogMessage => 
    createSafeLogMessage('Download completed: %s (%d bytes)'),
  cacheCheck: (): SafeLogMessage => 
    createSafeLogMessage('Checking cache for: %s'),
  cacheWrite: (): SafeLogMessage => 
    createSafeLogMessage('Writing to cache: %s'),
  strategyCreated: (): SafeLogMessage => 
    createSafeLogMessage('constructor: Created %s%s'),
  downloadStarted: (): SafeLogMessage => 
    createSafeLogMessage('Downloading URL: %s'),
  downloadToFileStarted: (): SafeLogMessage => 
    createSafeLogMessage('Downloading URL %s to file: %s'),
  fileExists: (exists: boolean): SafeLogMessage => 
    createSafeLogMessage(`Downloaded file exists: ${exists}`),
  fileCached: (): SafeLogMessage => 
    createSafeLogMessage('Successfully read file for caching'),
  errorCreated: (): SafeLogMessage => 
    createSafeLogMessage('%s created: message=%s, url=%s'),
  networkErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('NetworkError created: message=%s, url=%s, originalError=%o'),
  httpErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('HttpError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  notFoundErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('NotFoundError created: url=%s, responseBody=%o, responseHeaders=%o'),
  forbiddenErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('ForbiddenError created: url=%s, responseBody=%o, responseHeaders=%o'),
  rateLimitErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('RateLimitError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o, resetTimestamp=%d'),
  clientErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('ClientError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  serverErrorCreated: (): SafeLogMessage => 
    createSafeLogMessage('ServerError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  fetchProgress: (): SafeLogMessage => 
    createSafeLogMessage('fetch progress: %s'),
  fetchStarted: (): SafeLogMessage => 
    createSafeLogMessage('fetch started for URL: %s'),
  responseReceived: (): SafeLogMessage => 
    createSafeLogMessage('response received: %s'),
  responseProcessing: (): SafeLogMessage => 
    createSafeLogMessage('processing response for URL: %s'),
  downloadTimeout: (): SafeLogMessage => 
    createSafeLogMessage('Download timeout for %s'),
  downloadAttempt: (): SafeLogMessage => 
    createSafeLogMessage('Attempt %d: Downloading %s'),
  responseBodyReadFailed: (): SafeLogMessage => 
    createSafeLogMessage('Failed to read response body for error: %s, error: %o'),
  downloadFailed: (): SafeLogMessage => 
    createSafeLogMessage('Download failed: url=%s, statusCode=%d, statusText=%s, responseBody=%s'),
  downloadSuccessful: (): SafeLogMessage => 
    createSafeLogMessage('Download successful for %s, size: %d bytes'),
  savingToDestination: (): SafeLogMessage => 
    createSafeLogMessage('Saving to destination: %s'),
  savedSuccessfully: (): SafeLogMessage => 
    createSafeLogMessage('Successfully wrote to %s using IFileSystem'),
  downloadAttemptError: (): SafeLogMessage => 
    createSafeLogMessage('Error during download attempt %d for %s: %o'),
  retryingDownload: (): SafeLogMessage => 
    createSafeLogMessage('Retrying download for %s, attempt %d/%d after %dms'),
  exhaustedRetries: (): SafeLogMessage => 
    createSafeLogMessage('Exhausted retries for %s'),
} as const;