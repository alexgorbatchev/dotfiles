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
    jsonParseError: (url: string) => createSafeLogMessage(`JSON parse error for ${url}`),
  } satisfies SafeLogMessageMap,
  cratesIo: {
    querying: (crateName: string) => createSafeLogMessage(`Querying crates.io for crate ${crateName}`),
    notFound: (crateName: string) => createSafeLogMessage(`Crate not found: ${crateName}`),
    metadataError: (crateName: string) =>
      createSafeLogMessage(`Error fetching crate metadata for ${crateName}`),
  } satisfies SafeLogMessageMap,
  parsing: {
    parsingCrateMetadata: (sourceUrl: string) => createSafeLogMessage(`Parsing Cargo.toml from ${sourceUrl}`),
    cargoTomlParseError: (sourceUrl: string) =>
      createSafeLogMessage(`Error parsing Cargo.toml from ${sourceUrl}`),
  } satisfies SafeLogMessageMap,
} as const;
