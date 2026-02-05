import { createDashboardServer, type IDashboardServices } from '@dotfiles/dashboard';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import type { ICommandCompletionMeta, IGlobalProgram, IServices } from './types';

/**
 * Completion metadata for the dashboard command.
 */
export const DASHBOARD_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'dashboard',
  description: 'Start the web-based visualization dashboard',
  options: [
    { flag: '--port', description: 'Port to run the server on', hasArg: true, argPlaceholder: '<port>' },
    { flag: '--host', description: 'Host to bind the server to', hasArg: true, argPlaceholder: '<host>' },
  ],
};

interface DashboardCommandOptions {
  port?: string;
  host?: string;
}

/**
 * Registers the dashboard command with the CLI program.
 */
export function registerDashboardCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>,
) {
  const logger = parentLogger.getSubLogger({ name: 'dashboard' });

  program
    .command('dashboard')
    .description('Start the web-based visualization dashboard')
    .option('--port <port>', 'Port to run the server on', '3000')
    .option('--host <host>', 'Host to bind the server to', 'localhost')
    .action(async (options: DashboardCommandOptions) => {
      const port = parseInt(options.port ?? '3000', 10);
      const host = options.host ?? 'localhost';
      const services = await servicesFactory();

      const dashboardServices: IDashboardServices = {
        projectConfig: services.projectConfig,
        fs: services.fs,
        configService: services.configService,
        systemInfo: services.systemInfo,
        fileRegistry: services.fileRegistry,
        toolInstallationRegistry: services.toolInstallationRegistry,
        versionChecker: services.versionChecker,
        downloader: services.downloader,
      };

      const server = createDashboardServer(logger, dashboardServices, { port, host });
      await server.start();
    });
}
