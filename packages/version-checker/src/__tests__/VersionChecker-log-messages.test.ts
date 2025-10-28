import { describe, expect, test } from 'bun:test';
import { messages } from '../log-messages';

describe('messages', () => {
  test('initializing', () => {
    expect(String(messages.initializing())).toBe('Initializing VersionChecker with githubClient');
  });

  test('fetchingLatestRelease', () => {
    expect(String(messages.fetchingLatestRelease('owner', 'repo'))).toBe('Fetching latest version for owner/repo');
  });

  test('latestReleaseFound', () => {
    expect(String(messages.latestReleaseFound('1.2.3'))).toBe('Latest release found 1.2.3');
  });

  test('latestReleaseError', () => {
    expect(String(messages.latestReleaseError('owner', 'repo'))).toBe('Failed to fetch latest release for owner/repo');
  });

  test('noLatestRelease', () => {
    expect(String(messages.noLatestRelease('owner', 'repo'))).toBe('No latest release found for owner/repo');
  });

  test('comparingVersions', () => {
    expect(String(messages.comparingVersions('1.0.0', '2.0.0'))).toBe(
      'Comparing versions configured 1.0.0 vs latest 2.0.0'
    );
  });

  test('invalidConfiguredVersion', () => {
    expect(String(messages.invalidConfiguredVersion('bad'))).toBe('Configured version invalid bad');
  });

  test('invalidLatestVersion', () => {
    expect(String(messages.invalidLatestVersion('bad'))).toBe('Latest version invalid bad');
  });

  test('versionComparisonResult', () => {
    expect(String(messages.versionComparisonResult('NEWER_AVAILABLE'))).toBe(
      'Version comparison result NEWER_AVAILABLE'
    );
  });
});
