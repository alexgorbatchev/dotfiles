import { describe, expect, test } from 'bun:test';
import { versionCheckerLogMessages } from '../log-messages';

describe('versionCheckerLogMessages', () => {
  test('initializing', () => {
  expect(String(versionCheckerLogMessages.initializing())).toBe('Initializing VersionChecker with githubClient');
  });

  test('fetchingLatestRelease', () => {
    expect(String(versionCheckerLogMessages.fetchingLatestRelease('owner', 'repo'))).toBe(
      'Fetching latest version for owner/repo'
    );
  });

  test('latestReleaseFound', () => {
  expect(String(versionCheckerLogMessages.latestReleaseFound('1.2.3'))).toBe('Latest release found 1.2.3');
  });

  test('latestReleaseError', () => {
    expect(String(versionCheckerLogMessages.latestReleaseError('owner', 'repo', 'boom'))).toBe(
      'Failed to fetch latest release for owner/repo: boom'
    );
  });

  test('noLatestRelease', () => {
    expect(String(versionCheckerLogMessages.noLatestRelease('owner', 'repo'))).toBe(
      'No latest release found for owner/repo'
    );
  });

  test('comparingVersions', () => {
    expect(String(versionCheckerLogMessages.comparingVersions('1.0.0', '2.0.0'))).toBe(
      'Comparing versions configured 1.0.0 vs latest 2.0.0'
    );
  });

  test('invalidConfiguredVersion', () => {
  expect(String(versionCheckerLogMessages.invalidConfiguredVersion('bad'))).toBe('Configured version invalid bad');
  });

  test('invalidLatestVersion', () => {
  expect(String(versionCheckerLogMessages.invalidLatestVersion('bad'))).toBe('Latest version invalid bad');
  });

  test('versionComparisonResult', () => {
    expect(String(versionCheckerLogMessages.versionComparisonResult('NEWER_AVAILABLE'))).toBe(
      'Version comparison result NEWER_AVAILABLE'
    );
  });
});
