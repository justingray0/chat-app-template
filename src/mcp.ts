import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import react from '@vitejs/plugin-react';
import {
  chatGPTWidgetPlugin,
  getWidgetHTML,
  getWidgets,
} from 'vite-plugin-chatgpt-widgets';
import type { ViteDevServer, InlineConfig } from 'vite';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';

const WIDGETS_DIR = 'src/chatgpt-widgets';
const BASE_URL = 'http://localhost:5173';

export async function setupMcpServer(
  server: McpServer,
  viteServer: ViteDevServer
): Promise<McpServer> {
  const widgets = await getWidgets(WIDGETS_DIR, { devServer: viteServer });

  for (const widget of widgets) {
    const resourceName = `widget-${widget.name.toLowerCase()}`;
    const resourceUri = `ui://widget/${widget.name}.html`;

    server.registerResource(
      resourceName,
      resourceUri,
      {
        title: widget.name,
        description: `ChatGPT widget for ${widget.name}`,
      },
      async () => {
        const { content } = await getWidgetHTML(widget.name, {
          devServer: viteServer,
        });

        return {
          contents: [
            {
              uri: resourceUri,
              mimeType: 'text/html+skybridge',
              text: content,
            },
          ],
        };
      }
    );

    server.registerTool(
      widget.name,
      {
        title: `Show ${widget.name}`,
        _meta: {
          'openai/outputTemplate': resourceUri,
          'openai/toolInvocation/invoking': `Displaying ${widget.name}`,
          'openai/toolInvocation/invoked': `Displayed ${widget.name}`,
        },
        inputSchema: {
          payload: z.string().optional(),
        },
      },
      async () => ({
        content: [{ type: 'text', text: `Displayed the ${widget.name}!` }],
        structuredContent: {},
      })
    );
  }

  return server;
}

async function createViteServerForMcp(): Promise<ViteDevServer> {
  const config: InlineConfig = {
    configFile: false,
    root: process.cwd(),
    plugins: [
      react(),
      chatGPTWidgetPlugin({
        widgetsDir: WIDGETS_DIR,
        baseUrl: BASE_URL,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'custom',
  };

  return createViteServer(config);
}

async function createDefaultMcpServer(viteServer: ViteDevServer): Promise<McpServer> {
  const { createMcpServerDefault } = await import(
    'vite-plugin-mcp/dist/chunks/server.mjs'
  );

  const server = await createMcpServerDefault(
    {
      updateConfig: false,
    },
    viteServer
  );

  return server;
}

async function shutdown(
  server: McpServer,
  viteServer: ViteDevServer
): Promise<void> {
  await Promise.allSettled([server.close(), viteServer.close()]);
}

export async function startStandaloneMcpServer(): Promise<void> {
  const viteServer = await createViteServerForMcp();
  const mcpServer = await createDefaultMcpServer(viteServer);
  await setupMcpServer(mcpServer, viteServer);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  process.stdin.resume();
  process.stdout.write('MCP server ready (stdio transport)\n');

  let closing = false;
  const handleShutdown = async () => {
    if (closing) return;
    closing = true;
    await shutdown(mcpServer, viteServer);
  };

  process.on('SIGINT', async () => {
    await handleShutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await handleShutdown();
    process.exit(0);
  });

  process.on('exit', async () => {
    await handleShutdown();
  });
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entry && entry === modulePath) {
  startStandaloneMcpServer().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
