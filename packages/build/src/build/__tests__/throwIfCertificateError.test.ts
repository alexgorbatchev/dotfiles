import { describe, expect, test } from 'bun:test';
import { BuildError } from '../handleBuildError';
import { throwIfCertificateError } from '../helpers/throwIfCertificateError';

describe('throwIfCertificateError', () => {
  test('throws BuildError when output contains certificate verification error', () => {
    const output = [
      'error: UNKNOWN_CERTIFICATE_VERIFICATION_ERROR downloading package manifest minimatch',
      'error: UNKNOWN_CERTIFICATE_VERIFICATION_ERROR downloading package manifest tslog',
    ].join('\n');

    expect(() => throwIfCertificateError(output)).toThrow(BuildError);
    expect(() => throwIfCertificateError(output)).toThrow(
      'Certificate verification failed — Warp proxy appears to be active. Disable Warp and retry.',
    );
  });

  test('does not throw when output has no certificate errors', () => {
    const output = 'bun install v1.3.9\nInstalled 264 packages';

    expect(() => throwIfCertificateError(output)).not.toThrow();
  });

  test('does not throw for empty output', () => {
    expect(() => throwIfCertificateError('')).not.toThrow();
  });
});
