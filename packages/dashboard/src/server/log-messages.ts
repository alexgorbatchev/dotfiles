import { createSafeLogMessage } from '@dotfiles/logger';

export const messages = {
  serverStarting: (port: number) => createSafeLogMessage(`Starting dashboard server on port ${port}`),
  serverStarted: (url: string) => createSafeLogMessage(`Dashboard available at ${url}`),
  serverStopping: () => createSafeLogMessage('Stopping dashboard server'),
  serverStopped: () => createSafeLogMessage('Dashboard server stopped'),
  requestReceived: (method: string, path: string) => createSafeLogMessage(`${method} ${path}`),
  apiError: (endpoint: string) => createSafeLogMessage(`API error in ${endpoint}`),
  staticFileServed: (path: string) => createSafeLogMessage(`Served static file: ${path}`),
  staticFileNotFound: (path: string) => createSafeLogMessage(`Static file not found: ${path}`),
  healthCheckStarted: () => createSafeLogMessage('Running health checks'),
  healthCheckCompleted: (status: string) => createSafeLogMessage(`Health check completed: ${status}`),
};
