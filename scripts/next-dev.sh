#!/usr/bin/env bash

set -euo pipefail
export NODE_ENV=development

PORT="${PORT:-3004}"
SERVER_HOST="${HOST:-127.0.0.1}"

exec ./node_modules/.bin/next dev -H "${SERVER_HOST}" -p "${PORT}"
