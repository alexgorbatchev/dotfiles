import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cargoClientDebugTemplates = {
  constructorInit: () => createSafeLogMessage('Initializing %s with user agent: %s'),
  makingRequest: () => createSafeLogMessage('Making %s request to: %s'),
  emptyResponse: () => createSafeLogMessage('Empty response received from: %s'),
  jsonParseError: () => createSafeLogMessage('JSON parse error for %s: %s'),
  queryingCratesIo: () => createSafeLogMessage('Querying crates.io API for crate: %s'),
  crateNotFound: () => createSafeLogMessage('Crate not found: %s'),
  crateMetadataError: () => createSafeLogMessage('Error fetching crate metadata for %s: %s'),
  parsingCrateMetadata: () => createSafeLogMessage('Parsing Cargo.toml from: %s'),
  cargoTomlParseError: () => createSafeLogMessage('Error parsing Cargo.toml from %s: %s'),
} satisfies SafeLogMessageMap;
