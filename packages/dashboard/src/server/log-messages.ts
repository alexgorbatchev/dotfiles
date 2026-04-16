import { createSafeLogMessage } from "@dotfiles/logger";

export const messages = {
  serverStarted: (url: string) => createSafeLogMessage(`Dashboard available at ${url}`),
  serverStopping: () => createSafeLogMessage("Stopping dashboard server"),
  serverStopped: () => createSafeLogMessage("Dashboard server stopped"),
  requestReceived: (method: string, path: string) => createSafeLogMessage(`${method} ${path}`),
  apiError: (endpoint: string) => createSafeLogMessage(`API error in ${endpoint}`),
  installFailed: (error: string) => createSafeLogMessage(`Installation failed: ${error}`),
  installSucceeded: () => createSafeLogMessage("Installation succeeded"),
  checkUpdateCompleted: (hasUpdate: boolean, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(
      `Update check complete: hasUpdate=${hasUpdate} current=${currentVersion} latest=${latestVersion}`,
    ),
  checkUpdateFailed: (error: string) => createSafeLogMessage(`Update check failed: ${error}`),
  updateNotSupported: (method: string) => createSafeLogMessage(`Update not supported for method ${method}`),
  updateFailed: (error: string) => createSafeLogMessage(`Update failed: ${error}`),
  updateSucceeded: (oldVersion: string, newVersion: string) =>
    createSafeLogMessage(`Updated from ${oldVersion} to ${newVersion}`),
  usageLogImportCompleted: () => createSafeLogMessage("Imported usage logs: files=%d events=%d invalid=%d"),
  usageLogImportFailed: () => createSafeLogMessage("Failed to import usage logs"),
};
