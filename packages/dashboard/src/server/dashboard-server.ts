import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import { createApiRoutes } from './routes';
import type { IDashboardServer, IDashboardServerOptions, IDashboardServices } from './types';

// Bun HTML import - handles bundling automatically
import clientApp from '../client/dashboard.html';

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

      server = Bun.serve({
        port: options.port,
        hostname: options.host,
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
