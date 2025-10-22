import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const cargoClientLogMessages = {
  constructor: {
    initialized: (clientName: string, userAgent: string) =>
      createSafeLogMessage(`Initializing ${clientName} with user agent: ${userAgent}`),
  } satisfies SafeLogMessageMap,
  request: {
    makingRequest: (method: string, url: string) => createSafeLogMessage(`Making ${method} request to ${url}`),
  } satisfies SafeLogMessageMap,
  errors: {
    emptyResponse: (url: string) => createSafeLogMessage(`Empty response received from ${url}`),
    jsonParseError: (url: string, reason: string) => createSafeLogMessage(`JSON parse error for ${url}: ${reason}`),
  } satisfies SafeLogMessageMap,
  cratesIo: {
    querying: (crateName: string) => createSafeLogMessage(`Querying crates.io for crate ${crateName}`),
    notFound: (crateName: string) => createSafeLogMessage(`Crate not found: ${crateName}`),
    metadataError: (crateName: string, reason: string) =>
      createSafeLogMessage(`Error fetching crate metadata for ${crateName}: ${reason}`),
  } satisfies SafeLogMessageMap,
  parsing: {
    parsingCrateMetadata: (sourceUrl: string) => createSafeLogMessage(`Parsing Cargo.toml from ${sourceUrl}`),
    cargoTomlParseError: (sourceUrl: string, reason: string) =>
      createSafeLogMessage(`Error parsing Cargo.toml from ${sourceUrl}: ${reason}`),
  } satisfies SafeLogMessageMap,
} as const;
