import { describe, expect, test } from 'bun:test';
import { architectureLogMessages } from '../log-messages';

describe('architectureLogMessages', () => {
  test('patternGenerationStarted', () => {
    expect(String(architectureLogMessages.patternGenerationStarted('darwin', 'arm64'))).toBe(
      'Generating architecture patterns for darwin/arm64'
    );
  });

  test('patternGenerationCompleted', () => {
    expect(String(architectureLogMessages.patternGenerationCompleted('linux', 'x64'))).toBe(
      'Architecture patterns generated for linux/x64'
    );
  });

  test('regexGenerationStarted', () => {
    expect(String(architectureLogMessages.regexGenerationStarted())).toBe('Building architecture regex patterns');
  });

  test('regexGenerationCompleted', () => {
    expect(String(architectureLogMessages.regexGenerationCompleted())).toBe('Architecture regex patterns built');
  });

  test('architectureDetectionStarted', () => {
    expect(String(architectureLogMessages.architectureDetectionStarted('win32', 'x86'))).toBe(
      'Starting architecture detection for win32/x86'
    );
  });

  test('architectureDetectionCompleted', () => {
    expect(String(architectureLogMessages.architectureDetectionCompleted('win32', 'x86'))).toBe(
      'Architecture detection completed for win32/x86'
    );
  });

  test('assetMatchCheckStarted', () => {
    expect(String(architectureLogMessages.assetMatchCheckStarted('example.zip'))).toBe(
      'Checking architecture match for asset example.zip'
    );
  });

  test('assetMatchCheckCompleted', () => {
    expect(String(architectureLogMessages.assetMatchCheckCompleted('example.zip', true, false, false))).toBe(
      'Architecture match result for example.zip: system=match, cpu=no-match, overall=no-match'
    );
  });
});
