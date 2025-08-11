import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const downloaderDebugTemplates = {
  constructorDebug: () => 
    createSafeLogMessage('fileSystem=%o, config=%o'),
  downloadDebug: () => 
    createSafeLogMessage('url=%s, destination=%s, options=%o'),
  downloadStart: () => 
    createSafeLogMessage('Starting download: %s'),
  downloadProgress: () => 
    createSafeLogMessage('Download progress: %d%% (%d/%d bytes)'),
  downloadComplete: () => 
    createSafeLogMessage('Download completed: %s (%d bytes)'),
  cacheCheck: () => 
    createSafeLogMessage('Checking cache for: %s'),
  cacheWrite: () => 
    createSafeLogMessage('Writing to cache: %s'),
  strategyCreated: () => 
    createSafeLogMessage('constructor: Created %s%s'),
  downloadStarted: () => 
    createSafeLogMessage('Downloading URL: %s'),
  downloadToFileStarted: () => 
    createSafeLogMessage('Downloading URL %s to file: %s'),
  fileExists: (exists: boolean) => 
    createSafeLogMessage(`Downloaded file exists: ${exists}`),
  fileCached: () => 
    createSafeLogMessage('Successfully read file for caching'),
  errorCreated: () => 
    createSafeLogMessage('%s created: message=%s, url=%s'),
  networkErrorCreated: () => 
    createSafeLogMessage('NetworkError created: message=%s, url=%s, originalError=%o'),
  httpErrorCreated: () => 
    createSafeLogMessage('HttpError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  notFoundErrorCreated: () => 
    createSafeLogMessage('NotFoundError created: url=%s, responseBody=%o, responseHeaders=%o'),
  forbiddenErrorCreated: () => 
    createSafeLogMessage('ForbiddenError created: url=%s, responseBody=%o, responseHeaders=%o'),
  rateLimitErrorCreated: () => 
    createSafeLogMessage('RateLimitError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o, resetTimestamp=%d'),
  clientErrorCreated: () => 
    createSafeLogMessage('ClientError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  serverErrorCreated: () => 
    createSafeLogMessage('ServerError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
  fetchProgress: () => 
    createSafeLogMessage('fetch progress: %s'),
  fetchStarted: () => 
    createSafeLogMessage('fetch started for URL: %s'),
  responseReceived: () => 
    createSafeLogMessage('response received: %s'),
  responseProcessing: () => 
    createSafeLogMessage('processing response for URL: %s'),
  downloadTimeout: () => 
    createSafeLogMessage('Download timeout for %s'),
  downloadAttempt: () => 
    createSafeLogMessage('Attempt %d: Downloading %s'),
  responseBodyReadFailed: () => 
    createSafeLogMessage('Failed to read response body for error: %s, error: %o'),
  downloadFailed: () => 
    createSafeLogMessage('Download failed: url=%s, statusCode=%d, statusText=%s, responseBody=%s'),
  downloadSuccessful: () => 
    createSafeLogMessage('Download successful for %s, size: %d bytes'),
  savingToDestination: () => 
    createSafeLogMessage('Saving to destination: %s'),
  savedSuccessfully: () => 
    createSafeLogMessage('Successfully wrote to %s using IFileSystem'),
  downloadAttemptError: () => 
    createSafeLogMessage('Error during download attempt %d for %s: %o'),
  retryingDownload: () => 
    createSafeLogMessage('Retrying download for %s, attempt %d/%d after %dms'),
  exhaustedRetries: () => 
    createSafeLogMessage('Exhausted retries for %s'),
} satisfies SafeLogMessageMap;