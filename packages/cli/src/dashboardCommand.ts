import { Platform } from "@dotfiles/core";
import { createDashboardServer, type IDashboardServices } from "@dotfiles/dashboard";
import type { TsLogger } from "@dotfiles/logger";
import { $ } from "bun";
import { messages } from "./log-messages";
import type { ICommandCompletionMeta, IGlobalProgram, ServicesFactory } from "./types";

/**
 * Completion metadata for the dashboard command.
 */
export const DASHBOARD_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: "dashboard",
  description: "Start the web-based visualization dashboard",
  options: [
    { flag: "--port", description: "Port to run the server on", hasArg: true, argPlaceholder: "<port>" },
    { flag: "--host", description: "Host to bind the server to", hasArg: true, argPlaceholder: "<host>" },
    { flag: "--no-open", description: "Do not open browser when server starts", hasArg: false },
  ],
};

interface DashboardCommandOptions {
  port?: string;
  host?: string;
  open?: boolean;
}

export type BrowserOpener = (url: string, platform: Platform) => Promise<void>;
export type DashboardServerFactory = typeof createDashboardServer;

interface DashboardCommandDependencies {
  openBrowser?: BrowserOpener;
  createServer?: DashboardServerFactory;
}

/**
 * Default browser opener implementation.
 * Cross-platform compatible (macOS, Linux, Windows).
 */
const defaultOpenBrowser: BrowserOpener = async (url: string, platform: Platform): Promise<void> => {
  const command = platform === Platform.MacOS ? "open" : platform === Platform.Windows ? "start" : "xdg-open";
  await $`${command} ${url}`.nothrow().quiet();
};

/**
 * Registers the dashboard command with the CLI program.
 */
export function registerDashboardCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: ServicesFactory,
  deps: DashboardCommandDependencies = {},
) {
  const openBrowser = deps.openBrowser ?? defaultOpenBrowser;
  const createServer = deps.createServer ?? createDashboardServer;
  const logger = parentLogger.getSubLogger({ name: "dashboard" });

  program
    .command("dashboard")
    .description("Start the web-based visualization dashboard")
    .option("--port <port>", "Port to run the server on", "3000")
    .option("--host <host>", "Host to bind the server to", "localhost")
    .option("--no-open", "Do not open browser when server starts")
    .action(async (options: DashboardCommandOptions) => {
      const port = parseInt(options.port ?? "3000", 10);
      const host = options.host ?? "localhost";
      const shouldOpen = options.open ?? true;
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
        installer: services.installer,
        pluginRegistry: services.pluginRegistry,
      };

      const server = createServer(logger, dashboardServices, { port, host });
      const isRestart = await server.start();

      // Skip browser opening on HMR restarts (server was already running)
      if (shouldOpen && !isRestart) {
        const url = `http://${host}:${port}`;
        try {
          await openBrowser(url, services.systemInfo.platform);
        } catch (error) {
          logger.warn(messages.dashboardBrowserOpenFailed(), error);
        }
      }
    });
}
