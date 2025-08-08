import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const versionCheckerDebugTemplates = {
  constructorInit: (): SafeLogMessage => 
    createSafeLogMessage('Initializing VersionChecker with githubClient'),
  fetchingLatest: (): SafeLogMessage => 
    createSafeLogMessage('Fetching latest version for repository'),
  latestReleaseFound: (): SafeLogMessage => 
    createSafeLogMessage('Latest release found: %s'),
  latestReleaseError: (): SafeLogMessage => 
    createSafeLogMessage('Error fetching latest release for %s/%s: %s'),
  noLatestRelease: (): SafeLogMessage => 
    createSafeLogMessage('No latest release found for %s/%s'),
  comparingVersions: (): SafeLogMessage => 
    createSafeLogMessage('Comparing versions: configured=%s, latest=%s'),
  versionComparisonResult: (): SafeLogMessage => 
    createSafeLogMessage('Version comparison result: %s'),
  invalidConfiguredVersion: (): SafeLogMessage => 
    createSafeLogMessage('Invalid configured version: %s'),
  invalidLatestVersion: (): SafeLogMessage => 
    createSafeLogMessage('Invalid latest version: %s'),
  comparisonError: (): SafeLogMessage => 
    createSafeLogMessage('Error during version comparison: %s'),
} as const;