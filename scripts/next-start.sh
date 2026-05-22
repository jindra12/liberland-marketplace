#!/usr/bin/env bash

set -euo pipefail
export NODE_ENV=production

load_env_file() {
  local env_file="$1"

  if [[ ! -f "$env_file" ]]; then
    return
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

load_env_file ".env"

PORT="${PORT:-3001}"
SERVER_HOST="${HOST:-127.0.0.1}"

exec ./node_modules/.bin/next start -H "${SERVER_HOST}" -p "${PORT}"
