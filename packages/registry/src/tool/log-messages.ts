import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  databaseInitialized: () => createSafeLogMessage("Database initialized"),
  toolInstallationRecorded: () => createSafeLogMessage("Tool installation recorded: %s version %s"),
  toolInstallationNotFound: () => createSafeLogMessage("Tool installation not found: %s"),
  toolInstallationsRetrieved: () => createSafeLogMessage("Retrieved %d tool installations"),
  noUpdatesProvided: () => createSafeLogMessage("No updates provided for tool: %s"),
  toolInstallationUpdated: () => createSafeLogMessage("Tool installation updated: %s"),
  toolInstallationRemoved: () => createSafeLogMessage("Tool installation removed: %s"),
  toolInstallationCheckCompleted: () => createSafeLogMessage("Tool installation check: %s version %s - installed: %s"),
  databaseClosed: () => createSafeLogMessage("Database closed"),
} satisfies SafeLogMessageMap;
