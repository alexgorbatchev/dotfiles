import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const cargoHttpClientLogMessages = {
  fetchingCrateMetadata: (crateName: string) => createSafeLogMessage(`Cargo fetching crate metadata ${crateName}`),
  crateMetadataFetched: (crateName: string, version: string) =>
    createSafeLogMessage(`Cargo crate metadata fetched ${crateName} max version ${version}`),
} satisfies SafeLogMessageMap;
