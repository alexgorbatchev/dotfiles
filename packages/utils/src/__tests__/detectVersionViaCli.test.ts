import { describe, expect, it } from 'bun:test';
import { detectVersionViaCli } from '../detectVersionViaCli';

// Helper to create a mock shell
function createMockShell(stdout: string, stderr = '', exitCode = 0) {
  const mockShell = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    return {
      env: () => ({
        quiet: () => ({
          nothrow: async () => ({
            stdout: Buffer.from(stdout),
            stderr: Buffer.from(stderr),
            exitCode,
          }),
        }),
      }),
    };
  };
  return mockShell as unknown as typeof import('bun').$;
}

describe('detectVersionViaCli', () => {
  describe('default regex', () => {
    const testCases = [
      ['just semver', '1.2.3', '1.2.3'],
      ['toolname semver', 'tool 1.2.3', '1.2.3'],
      ['toolname version semver', 'tool version 1.2.3', '1.2.3'],
      ['v prefix', 'v1.2.3', '1.2.3'],
      ['toolname v prefix', 'tool v1.2.3', '1.2.3'],
      ['multiline with prefix', 'some prefix\ntool 1.2.3', '1.2.3'],
      ['multiline with prefix and suffix', 'some prefix\ntool 1.2.3\nsome suffix', '1.2.3'],
      ['multiline with prefix and after', 'some prefix\ntool 1.2.3', '1.2.3'],
      ['prerelease', '1.2.3-beta.1', '1.2.3-beta.1'],
      ['build metadata', '1.2.3+build.123', '1.2.3+build.123'],
      ['prerelease and build metadata', '1.2.3-beta.1+build.123', '1.2.3-beta.1+build.123'],
      ['complex output', 'Found version: 10.20.30-rc.1+sha.5114f85', '10.20.30-rc.1+sha.5114f85'],
    ];

    it.each(testCases)(`should detect version from %s`, async (_name, stdout, expected) => {
      const shellExecutor = createMockShell(stdout);
      const version = await detectVersionViaCli({ binaryPath: 'tool', shellExecutor });
      expect(version).toBe(expected);
    });
  });

  it('should use custom regex if provided', async () => {
    const shellExecutor = createMockShell('custom output: version-1.2.3');
    const version = await detectVersionViaCli({
      binaryPath: 'tool',
      regex: /version-(\d+\.\d+\.\d+)/,
      shellExecutor,
    });
    expect(version).toBe('1.2.3');
  });

  it('should return undefined if no version found', async () => {
    const shellExecutor = createMockShell('no version here');
    const version = await detectVersionViaCli({ binaryPath: 'tool', shellExecutor });
    expect(version).toBeUndefined();
  });

  it('should return undefined if command fails', async () => {
    const mockShell = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
      return {
        env: () => ({
          quiet: () => ({
            nothrow: async () => {
              throw new Error('Command failed');
            },
          }),
        }),
      };
    };
    const version = await detectVersionViaCli({
      binaryPath: 'tool',
      shellExecutor: mockShell as unknown as typeof import('bun').$,
    });
    expect(version).toBeUndefined();
  });

  it('should handle stderr output', async () => {
    const shellExecutor = createMockShell('', 'tool version 1.2.3');
    const version = await detectVersionViaCli({ binaryPath: 'tool', shellExecutor });
    expect(version).toBe('1.2.3');
  });
});
