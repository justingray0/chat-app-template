import path from 'path';
import react from '@vitejs/plugin-react';
import {
  chatGPTWidgetPlugin,
  getWidgetHTML,
  getWidgets,
} from 'vite-plugin-chatgpt-widgets';
import { ViteMcp } from 'vite-plugin-mcp';
import { defineConfig } from 'vite';
import { z } from 'zod';

export default defineConfig({
  plugins: [
    react(),
    chatGPTWidgetPlugin({
      widgetsDir: 'src/chatgpt-widgets',
      baseUrl: 'http://localhost:5173',
    }),
    ViteMcp({
      async mcpServerSetup(server, viteServer) {
        const widgets = await getWidgets('src/chatgpt-widgets', {
          devServer: viteServer,
        });

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
              content: [
                { type: 'text', text: `Displayed the ${widget.name}!` },
              ],
              structuredContent: {},
            })
          );
        }

        return server;
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
