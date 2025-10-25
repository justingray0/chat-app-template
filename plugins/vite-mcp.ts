import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';

import c from 'ansis';
import DEBUG from 'debug';
import { type Plugin, type ViteDevServer } from 'vite';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const debug = DEBUG('vite:mcp:server');

const MCP_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_SERVER_VERSION = '0.3.0-streamable';

type Awaitable<T> = T | PromiseLike<T>;

export interface ViteMcpOptions {
  host?: string;
  port?: number;
  printUrl?: boolean;
  mcpServerInfo?: Implementation;
  mcpServer?: (viteServer: ViteDevServer) => Awaitable<McpServer>;
  mcpServerSetup?: (
    server: McpServer,
    viteServer: ViteDevServer
  ) => Awaitable<void | McpServer>;
  mcpRouteRoot?: string;
  /** @deprecated Use `mcpRouteRoot` instead */
  mcpPath?: string;
}

async function setupRoutes(
  base: string,
  createServer: () => Promise<McpServer>,
  vite: ViteDevServer
) {
  const withCors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (origin !== '*') {
      const existingVary = res.getHeader('Vary');
      const vary =
        typeof existingVary === 'string'
          ? existingVary.split(',').map((v) => v.trim())
          : Array.isArray(existingVary)
            ? existingVary.flatMap((value) =>
                typeof value === 'string'
                  ? value.split(',').map((v) => v.trim())
                  : []
              )
            : [];
      if (!vary.includes('Origin')) {
        vary.push('Origin');
      }
      res.setHeader('Vary', vary.join(', '));
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      'content-type,mcp-session-id,mcp-protocol-version'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'mcp-session-id,mcp-protocol-version'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Mcp-Protocol-Version', MCP_PROTOCOL_VERSION);
  };

  vite.middlewares.use(`${base}`, async (req, res, next) => {
    if (!req.method) {
      next();
      return;
    }

    if (!['GET', 'POST', 'DELETE', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }

    withCors(req, res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const server = await createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      transport.onerror = (error) => {
        debug('Streamable transport error: %O', error);
      };

      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        try {
          await transport.close();
        } catch (error) {
          debug('Error closing transport: %O', error);
        }
        try {
          await server.close();
        } catch (error) {
          debug('Error closing MCP server: %O', error);
        }
      };

      res.on('finish', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);

      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      debug('Error handling MCP request: %O', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });
}

function createMcpServerDefault(options: ViteMcpOptions): McpServer {
  const server = new McpServer({
    name: 'vite',
    version: DEFAULT_SERVER_VERSION,
    ...options.mcpServerInfo,
  });

  return server;
}

export function ViteMcp(options: ViteMcpOptions = {}): Plugin {
  const {
    printUrl = true,
    mcpServer = () => Promise.resolve(createMcpServerDefault(options)),
  } = options;

  const mcpRoute = options.mcpRouteRoot ?? options.mcpPath ?? '/__mcp';

  return {
    name: 'vite-plugin-mcp-local',
    async configureServer(vite) {
      const createServer = async () => {
        let server = await mcpServer(vite);
        const maybeCustomServer = await options.mcpServerSetup?.(server, vite);
        if (maybeCustomServer) {
          server = maybeCustomServer;
        }
        return server;
      };

      await setupRoutes(mcpRoute, createServer, vite);

      const protocol = vite.config.server.https ? 'https' : 'http';
      const host = options.host ?? 'localhost';
      const address = vite.httpServer?.address();
      const resolvedPort =
        options.port ??
        (typeof address === 'object' && address !== null
          ? (address as AddressInfo).port
          : undefined) ??
        vite.config.server.port ??
        5173;
      const streamUrl = `${protocol}://${host}:${resolvedPort}${mcpRoute}`;

      if (printUrl) {
        console.log(
          `${c.cyan`  ➜ MCP:      `}${c.gray(
            `MCP server is running at ${c.green(streamUrl)}`
          )}`
        );
      }
    },
  };
}

export type { McpServer };

export default ViteMcp;
