import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cargoInstallerDebugTemplates = {
  queryingCratesIo: () => createSafeLogMessage('Querying crates.io API for crate: %s'),
  foundCrateVersion: () => createSafeLogMessage('Found crate %s version %s'),
  installingFromCratesIo: () => createSafeLogMessage('Installing %s from crates.io using cargo install'),
  installingFromGit: () => createSafeLogMessage('Installing %s from git repository: %s'),
  cargoInstallCommand: () => createSafeLogMessage('Executing cargo install command: %s'),
  cargoInstallCompleted: () => createSafeLogMessage('Cargo install completed successfully'),
  foundBinaries: () => createSafeLogMessage('Found binaries in crate: %o'),
  checkingCargoInstallation: () => createSafeLogMessage('Checking if cargo is available'),
  cargoNotFound: () => createSafeLogMessage('Cargo not found in PATH, please install Rust toolchain'),
  parsingCrateMetadata: () => createSafeLogMessage('Parsing crate metadata for %s'),
  usingFeatures: () => createSafeLogMessage('Installing with features: %s'),
  usingTarget: () => createSafeLogMessage('Installing for target: %s'),
} satisfies SafeLogMessageMap;
