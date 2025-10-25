#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MCP_BASE_URL:-http://localhost:5174}"
SSE_URL="${BASE_URL%/}/__mcp/sse"
CONNECT_TIMEOUT="${MCP_CONNECT_TIMEOUT:-5}"
REQUEST_TIMEOUT="${MCP_REQUEST_TIMEOUT:-5}"

fifo=$(mktemp)
rm -f "${fifo}"
mkfifo "${fifo}"

cleanup() {
  if [[ -n "${curl_pid:-}" ]]; then
    kill "${curl_pid}" 2>/dev/null || true
    wait "${curl_pid}" 2>/dev/null || true
  fi
  exec 3>&- 2>/dev/null || true
  rm -f "${fifo}"
}
trap cleanup EXIT

# Keep the SSE stream running in the background and read it through a FIFO so we can
# synchronously pull JSON-RPC events while sending POST requests on the side.
curl -sS -N -H 'Accept: text/event-stream' "${SSE_URL}" > "${fifo}" &
curl_pid=$!

exec 3<"${fifo}"

endpoint_line=""
start=$SECONDS
while IFS= read -r -t 1 line <&3; do
  if [[ ${line} == data:* ]]; then
    endpoint_line=${line#data: }
    endpoint_line=${endpoint_line%%$'\r'*}
    break
  fi
  if (( SECONDS - start >= CONNECT_TIMEOUT )); then
    break
  fi
done

if [[ -z ${endpoint_line} ]]; then
  echo 'Failed to establish MCP SSE session. Is the dev server running with MCP enabled?' >&2
  exit 1
fi

messages_url="${BASE_URL%/}${endpoint_line}"

# The MCP protocol requires an initialize request before any other RPCs.
init_payload=$(jq -n '{jsonrpc:"2.0",id:"init",method:"initialize",params:{protocolVersion:"2024-10-07",clientInfo:{name:"npm-script",version:"0.0.0"},capabilities:{tools:{}}}}')
curl --max-time "${REQUEST_TIMEOUT}" -sS -X POST "${messages_url}" -H 'Content-Type: application/json' -d "${init_payload}" >/dev/null

# Parse the SSE stream, which delivers JSON-RPC messages prefixed by "event:" and "data:" lines.
read_event() {
  local line
  local event=""
  local data=""
  local start=$SECONDS
  while true; do
    if ! IFS= read -r -t 1 line <&3; then
      if (( SECONDS - start >= REQUEST_TIMEOUT )); then
        return 1
      fi
      continue
    fi
    if [[ -z ${line} ]]; then
      if [[ -n ${event} || -n ${data} ]]; then
        EVENT_TYPE=${event}
        EVENT_DATA=${data}
        return 0
      fi
      continue
    fi
    case ${line} in
      event:*) event=${line#event: } ;;
      data:*) data+="${line#data: }" ;;
    esac
  done
}

await_response() {
  local target_id=$1
  local deadline=$((SECONDS + REQUEST_TIMEOUT))
  while (( SECONDS <= deadline )); do
    if read_event; then
      if [[ ${EVENT_TYPE:-} == message ]]; then
        local message=${EVENT_DATA:-}
        local id
        id=$(printf '%s\n' "${message}" | jq -r 'try .id // empty' 2>/dev/null || true)
        if [[ ${id} == "${target_id}" ]]; then
          RESPONSE_JSON=${message}
          return 0
        fi
      fi
    fi
  done
  echo "Timed out waiting for response ${target_id}" >&2
  return 1
}

await_response "init"
printf '%s' "${RESPONSE_JSON}" | jq -e 'if .error then error(.error.message) else .result end' >/dev/null

list_payload=$(jq -n '{jsonrpc:"2.0",id:"tools",method:"tools/list"}')
# Request the tool list and wait for the corresponding SSE message carrying the JSON-RPC response.
curl --max-time "${REQUEST_TIMEOUT}" -sS -X POST "${messages_url}" -H 'Content-Type: application/json' -d "${list_payload}" >/dev/null
await_response "tools"
printf '%s' "${RESPONSE_JSON}" | jq '.result.tools'
