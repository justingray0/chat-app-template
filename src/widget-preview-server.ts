import express from 'express';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.WIDGET_PREVIEW_PORT || 5173;
const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:5173';
const MCP_ROUTE = '/__mcp';

interface WidgetGlobals {
  toolInput?: any;
  toolOutput?: any;
  widgetState?: any;
}

async function fetchWidgetHTML(resourceName: string): Promise<string> {
  const resourcesRequest = {
    jsonrpc: '2.0',
    id: 'get-resource',
    method: 'resources/read',
    params: {
      uri: `ui://widget/${resourceName}.html`,
    },
  };

  const response = await fetch(`${MCP_BASE_URL}${MCP_ROUTE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(resourcesRequest),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`);
  }

  return result.result.contents[0].text;
}

function injectOpenAIMock(
  html: string,
  mockScript: string,
  globals: WidgetGlobals
): string {
  const headEndIndex = html.indexOf('</head>');
  if (headEndIndex === -1) {
    throw new Error('No </head> tag found in HTML');
  }

  const mockScriptTag = `<script>${mockScript}</script>`;
  const globalsScriptTag = `<script>
    window.openai.toolInput = ${JSON.stringify(globals.toolInput || {})};
    window.openai.toolOutput = ${JSON.stringify(globals.toolOutput || null)};
    window.openai.widgetState = ${JSON.stringify(globals.widgetState || null)};
  </script>`;

  return (
    html.slice(0, headEndIndex) +
    mockScriptTag +
    globalsScriptTag +
    html.slice(headEndIndex)
  );
}

app.get('/widget/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { toolInput, toolOutput, widgetState } = req.query;

    const widgetHTML = await fetchWidgetHTML(name);

    const mockPath = join(__dirname, '../openai-mock.js');
    const mockScript = await readFile(mockPath, 'utf-8');

    const modifiedHTML = injectOpenAIMock(widgetHTML, mockScript, {
      toolInput: toolInput ? JSON.parse(toolInput as string) : {},
      toolOutput: toolOutput ? JSON.parse(toolOutput as string) : null,
      widgetState: widgetState ? JSON.parse(widgetState as string) : null,
    });

    res.type('text/html').send(modifiedHTML);
  } catch (error) {
    console.error('Error serving widget preview:', error);
    res.status(500).send(`Failed to load widget preview: ${error}`);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
  console.log(`Widget preview server running at http://localhost:${PORT}`);
});
