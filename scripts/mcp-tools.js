#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:5173';
const DEFAULT_ROUTE = '/__mcp';
const REQUEST_PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'simple-http-client', version: '0.0.0' };

const baseUrlInput = process.env.MCP_BASE_URL ?? DEFAULT_BASE_URL;
const routeInput = process.env.MCP_ROUTE ?? DEFAULT_ROUTE;
const connectTimeoutMs = toMilliseconds(process.env.MCP_CONNECT_TIMEOUT, 5000);
const requestTimeoutMs = toMilliseconds(process.env.MCP_REQUEST_TIMEOUT, 5000);

async function main() {
  const endpoint = resolveEndpoint(baseUrlInput, routeInput);
  console.log(`Using MCP endpoint: ${endpoint.href}`);

  try {
    const initPayload = {
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: REQUEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: CLIENT_INFO,
      },
    };

    const initResponse = await sendRpc(endpoint, initPayload, {
      label: 'initialize',
      timeoutMs: connectTimeoutMs,
    });

    const initMessage = selectMessage(initResponse.json, 'init');
    if (!initMessage) {
      throw new Error('Initialize response did not include an "init" message.');
    }
    if ('error' in initMessage) {
      throw new Error(
        `Initialize failed: ${JSON.stringify(initMessage.error)}`
      );
    }

    const negotiatedProtocol =
      initMessage.result?.protocolVersion ?? REQUEST_PROTOCOL_VERSION;
    const sessionId = initResponse.headers.get('mcp-session-id') ?? undefined;

    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };
    await sendRpc(endpoint, initializedNotification, {
      label: 'notifications/initialized',
      timeoutMs: requestTimeoutMs,
      sessionId,
      protocolVersion: negotiatedProtocol,
      expectBody: false,
    });

    const listPayload = {
      jsonrpc: '2.0',
      id: 'tools',
      method: 'tools/list',
      params: {},
    };
    const listResponse = await sendRpc(endpoint, listPayload, {
      label: 'tools/list',
      timeoutMs: requestTimeoutMs,
      sessionId,
      protocolVersion: negotiatedProtocol,
    });

    const listMessage = selectMessage(listResponse.json, 'tools');
    if (!listMessage) {
      throw new Error('tools/list response did not include a "tools" message.');
    }
    if ('error' in listMessage) {
      throw new Error(
        `tools/list failed: ${JSON.stringify(listMessage.error)}`
      );
    }

    const tools = listMessage.result?.tools ?? [];
    console.log(JSON.stringify(tools, null, 2));
  } catch (error) {
    console.error('Failed to list tools:', formatError(error));
    process.exitCode = 1;
  }
}

async function sendRpc(url, payload, options) {
  const {
    label,
    timeoutMs,
    sessionId,
    protocolVersion,
    expectBody = true,
  } = options;

  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  if (protocolVersion) {
    headers['mcp-protocol-version'] = protocolVersion;
  }

  const body = JSON.stringify(payload);
  logRequest(label, url, headers, body);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body,
    },
    timeoutMs,
    label
  );

  const responseHeaders = Object.fromEntries(response.headers.entries());
  console.log(`[${label}] Response status: ${response.status}`);
  console.log(`[${label}] Response headers:`, responseHeaders);

  const text = expectBody
    ? await response.text()
    : await safeReadBody(response);
  if (text) {
    console.log(`[${label}] Response body: ${text}`);
  }

  if (!response.ok && response.status !== 202) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON for ${label}: ${formatError(error)}`
      );
    }
  }

  return { response, headers: response.headers, json };
}

function selectMessage(payload, id) {
  if (!payload) {
    return null;
  }
  const messages = Array.isArray(payload) ? payload : [payload];
  if (id === undefined) {
    return messages[0] ?? null;
  }
  return messages.find((message) => message?.id === id) ?? null;
}

function logRequest(label, url, headers, body) {
  console.log(`[${label}] POST ${url.href}`);
  console.log(`[${label}] Request headers:`, headers);
  console.log(`[${label}] Request body: ${body}`);
}

async function fetchWithTimeout(url, init, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out while attempting to ${label}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function resolveEndpoint(base, route) {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  try {
    return new URL(normalizedRoute, ensureTrailingSlash(base));
  } catch (error) {
    throw new Error(
      `Invalid MCP endpoint configuration: ${formatError(error)}`
    );
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

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

main();
