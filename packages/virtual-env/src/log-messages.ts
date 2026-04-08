import { createSafeLogMessage } from "@dotfiles/logger";

export const messages = {
  creatingEnv: (name: string) => createSafeLogMessage(`Creating environment: ${name}`),
  envCreated: (envDir: string) => createSafeLogMessage(`Environment created at ${envDir}`),
  envAlreadyExists: (envDir: string) => createSafeLogMessage(`Environment already exists at ${envDir}`),
  envNotFound: (envDir: string) => createSafeLogMessage(`Environment not found at ${envDir}`),
  deletingEnv: (name: string) => createSafeLogMessage(`Deleting environment: ${name}`),
  envDeleted: (envDir: string) => createSafeLogMessage(`Environment deleted at ${envDir}`),
  envDetected: (envDir: string) => createSafeLogMessage(`Detected environment at ${envDir}`),
  envActive: (name: string) => createSafeLogMessage(`Active environment: ${name}`),
  sourceFileGenerated: (path: string) => createSafeLogMessage(`Source file generated at ${path}`),
  configFileGenerated: (path: string) => createSafeLogMessage(`Config file generated at ${path}`),
  toolsDirCreated: (path: string) => createSafeLogMessage(`Tools directory created at ${path}`),
  writeFile: (path: string) => createSafeLogMessage(`Writing ${path}`),
  deleteConfirmationRequired: () => createSafeLogMessage("Deletion requires confirmation"),
};
