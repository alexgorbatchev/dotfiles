/**
 * Test fixtures for enforceCliBundleSizeLimit tests
 */

export const FIXTURE_SMALL_FILE_SIZE_BYTES = 512 * 1024; // 512 KB
export const FIXTURE_LARGE_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const FIXTURE_MAX_SIZE_LIMIT_BYTES = 1024 * 1024; // 1 MB

export const FIXTURE_FILE_STATES = {
  underLimit: FIXTURE_SMALL_FILE_SIZE_BYTES,
  atLimit: FIXTURE_MAX_SIZE_LIMIT_BYTES,
  overLimit: FIXTURE_LARGE_FILE_SIZE_BYTES,
  empty: 0,
  justUnder: FIXTURE_MAX_SIZE_LIMIT_BYTES - 1,
  justOver: FIXTURE_MAX_SIZE_LIMIT_BYTES + 1,
};
