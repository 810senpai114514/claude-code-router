#!/bin/sh
set -eu

CCR_DATA_DIR="${CCR_DATA_DIR:-/data}"
CCR_GATEWAY_HOST="${CCR_GATEWAY_HOST:-127.0.0.1}"
CCR_GATEWAY_PORT="${CCR_GATEWAY_PORT:-3456}"
CCR_GATEWAY_CORE_PORT="${CCR_GATEWAY_CORE_PORT:-3457}"
CCR_WEB_HOST="${CCR_WEB_HOST:-127.0.0.1}"
CCR_WEB_PORT="${CCR_WEB_PORT:-3459}"

export HOME="${CCR_DATA_DIR}"
export CCR_DATA_DIR
export CCR_GATEWAY_CORE_PORT
export CCR_GATEWAY_HOST
export CCR_GATEWAY_PORT
export CCR_WEB_HOST
export CCR_WEB_PORT

mkdir -p "${CCR_DATA_DIR}/.claude-code-router"
cd /app

exec node /app/packages/core/dist/main/server.js \
  --host "${CCR_WEB_HOST}" --port "${CCR_WEB_PORT}" --no-open
