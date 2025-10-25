#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_BASE_URL = 'http://localhost:5174';
const DEFAULT_ROUTE = '/__mcp';
const baseUrlInput = process.env.MCP_BASE_URL ?? DEFAULT_BASE_URL;
const routeInput = process.env.MCP_ROUTE ?? DEFAULT_ROUTE;
const connectTimeoutMs = toMilliseconds(process.env.MCP_CONNECT_TIMEOUT, 5000);
const requestTimeoutMs = toMilliseconds(process.env.MCP_REQUEST_TIMEOUT, 5000);

async function main() {
  const endpoint = resolveEndpoint(baseUrlInput, routeInput);
  const transport = new StreamableHTTPClientTransport(endpoint);
  transport.onerror = (error) => {
    if (shouldLogError(error)) {
      console.error('Streamable transport error:', formatError(error));
    }
  };
  const client = new Client({ name: 'npm-script', version: '0.0.0' }, { capabilities: { tools: {} } });
  client.onerror = (error) => {
    if (shouldLogError(error)) {
      console.error('Client error:', formatError(error));
    }
  };

  try {
    await withTimeout(client.connect(transport), connectTimeoutMs, 'connect to the MCP server');
    const listResult = await withTimeout(
      client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema),
      requestTimeoutMs,
      'retrieve the tool list'
    );
    console.log(JSON.stringify(listResult.tools, null, 2));
  } catch (error) {
    console.error('Failed to list tools:', formatError(error));
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
    if (typeof transport.close === 'function') {
      await transport.close().catch(() => {});
    }
  }
}

function resolveEndpoint(base, route) {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  try {
    return new URL(normalizedRoute, ensureTrailingSlash(base));
  } catch (error) {
    throw new Error(`Invalid MCP endpoint configuration: ${formatError(error)}`);
  }
}

function ensureTrailingSlash(urlString) {
  return urlString.endsWith('/') ? urlString : `${urlString}/`;
}

function toMilliseconds(value, fallbackMs) {
  if (!value) {
    return fallbackMs;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return parsed * 1000;
}

async function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out while attempting to ${label}`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function shouldLogError(error) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return false;
    }
    if (typeof error.message === 'string' && error.message.toLowerCase().includes('aborted')) {
      return false;
    }
  }
  return true;
}

main();
