import { createSafeLogMessage } from '@dotfiles/logger';

export const messages = {
  serverStarted: (url: string) => createSafeLogMessage(`Dashboard available at ${url}`),
  serverStopping: () => createSafeLogMessage('Stopping dashboard server'),
  serverStopped: () => createSafeLogMessage('Dashboard server stopped'),
  requestReceived: (method: string, path: string) => createSafeLogMessage(`${method} ${path}`),
  apiError: (endpoint: string) => createSafeLogMessage(`API error in ${endpoint}`),
  installFailed: (error: string) => createSafeLogMessage(`Installation failed: ${error}`),
  installSucceeded: () => createSafeLogMessage('Installation succeeded'),
};
