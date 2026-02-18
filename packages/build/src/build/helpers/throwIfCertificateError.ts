import { BuildError } from '../handleBuildError';

const CERTIFICATE_ERROR_PATTERN = 'CERTIFICATE_VERIFICATION_ERROR';

/**
 * Checks command output for certificate verification errors and throws a BuildError
 * with a clear message indicating Warp proxy needs to be disabled.
 */
export function throwIfCertificateError(output: string): void {
  if (output.includes(CERTIFICATE_ERROR_PATTERN)) {
    throw new BuildError(
      'Certificate verification failed — Warp proxy appears to be active. Disable Warp and retry.',
    );
  }
}
