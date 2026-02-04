import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import { createApiRoutes } from './routes';
import type { IDashboardServer, IDashboardServerOptions, IDashboardServices } from './types';

// Bun HTML import - handles bundling automatically
import clientApp from '../client/dashboard.html';

/**
 * The directory containing this module (and the bundled chunk files).
 * Bun's HTML import feature generates chunks with relative paths that are resolved
 * from the current working directory. We need to ensure the CWD is the package
 * directory where the chunks are located.
 */
const PACKAGE_DIR = import.meta.dir;

/**
 * Creates and returns a dashboard server instance.
 */
export function createDashboardServer(
  parentLogger: TsLogger,
  services: IDashboardServices,
  options: IDashboardServerOptions,
): IDashboardServer {
  const logger = parentLogger.getSubLogger({ name: 'DashboardServer' });
  const api = createApiRoutes(logger, services);

  let server: ReturnType<typeof Bun.serve> | null = null;

  return {
    async start() {
      logger.info(messages.serverStarting(options.port));

      // IMPORTANT: Change to package directory before starting server.
      // Bun's HTML import generates chunk files (like dashboard-*.js, cli-*.js)
      // that are referenced with relative paths (e.g., "./dashboard-pks45b1c.js").
      // These paths are resolved from the CWD, so we must ensure we're in the
      // directory where the chunks are located.
      process.chdir(PACKAGE_DIR);

      server = Bun.serve({
        port: options.port,
        hostname: options.host,
        development: process.env.NODE_ENV !== 'production',
        routes: {
          '/api/tools': async () => {
            const result = await api.getTools();
            return Response.json(result);
          },

          '/api/stats': async () => {
            const result = await api.getStats();
            return Response.json(result);
          },

          '/api/health': async () => {
            const result = await api.getHealth();
            return Response.json(result);
          },

          '/api/config': async () => {
            const result = await api.getConfig();
            return Response.json(result);
          },

          '/api/tool-configs-tree': async () => {
            const result = await api.getToolConfigsTree();
            return Response.json(result);
          },

          '/api/shell': async () => {
            const result = await api.getShellIntegration();
            return Response.json(result);
          },

          '/api/activity': async (req) => {
            const url = new URL(req.url);
            const limitParam = url.searchParams.get('limit');
            const limit = limitParam ? parseInt(limitParam, 10) : undefined;
            const result = await api.getActivity(limit);
            return Response.json(result);
          },

          '/api/tools/:name/history': async (req: Request & { params: { name: string; }; }) => {
            const toolName = decodeURIComponent(req.params.name);
            const result = await api.getToolHistory(toolName);
            return Response.json(result);
          },

          '/api/*': Response.json({ success: false, error: 'Not found' }, { status: 404 }),

          '/*': clientApp,
        },
        fetch(request) {
          const url = new URL(request.url);
          logger.debug(messages.requestReceived(request.method, url.pathname));
          return new Response('Not Found', { status: 404 });
        },
      });

      logger.info(messages.serverStarted(this.getUrl()));
    },

    async stop() {
      logger.info(messages.serverStopping());
      if (server) {
        server.stop();
        server = null;
      }
      logger.info(messages.serverStopped());
    },

    getUrl() {
      return `http://${options.host}:${options.port}`;
    },
  };
}

export type { IDashboardServer, IDashboardServerOptions, IDashboardServices };
