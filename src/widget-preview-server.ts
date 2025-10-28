import express from 'express';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse, serialize } from 'parse5';

const app = express();
const PORT = process.env.WIDGET_PREVIEW_PORT || 5174;
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
      uri: `ui://widget/${resourceName}.html`
    }
  };
  
  const response = await fetch(`${MCP_BASE_URL}${MCP_ROUTE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(resourcesRequest)
  });
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`);
  }
  
  return result.result.contents[0].text;
}

function injectOpenAIMock(html: string, mockScript: string, globals: WidgetGlobals): string {
  const document = parse(html);
  
  const findHead = (node: any): any => {
    if (node.tagName === 'head') return node;
    if (node.childNodes) {
      for (const child of node.childNodes) {
        const found = findHead(child);
        if (found) return found;
      }
    }
    return null;
  };
  
  const head = findHead(document);
  if (!head) throw new Error('No <head> element found in HTML');
  
  const mockScriptNode = {
    nodeName: 'script',
    tagName: 'script',
    attrs: [],
    childNodes: [{
      nodeName: '#text',
      value: mockScript
    }]
  };
  
  const globalsScriptNode = {
    nodeName: 'script',
    tagName: 'script',
    attrs: [],
    childNodes: [{
      nodeName: '#text',
      value: `
        window.openai.toolInput = ${JSON.stringify(globals.toolInput || {})};
        window.openai.toolOutput = ${JSON.stringify(globals.toolOutput || null)};
        window.openai.widgetState = ${JSON.stringify(globals.widgetState || null)};
      `
    }]
  };
  
  head.childNodes.unshift(globalsScriptNode);
  head.childNodes.unshift(mockScriptNode);
  
  return serialize(document);
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
      widgetState: widgetState ? JSON.parse(widgetState as string) : null
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
