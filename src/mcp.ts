import type { McpServer } from 'vite-plugin-mcp';
import type { ViteDevServer } from 'vite';
import { getWidgetHTML, getWidgets } from 'vite-plugin-chatgpt-widgets';
import { z } from 'zod';

export default async function mcp(
  server: McpServer,
  viteServer: ViteDevServer
) {
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
        content: [{ type: 'text', text: `Displayed the ${widget.name}!` }],
        structuredContent: {},
      })
    );
  }

  return server;
}
