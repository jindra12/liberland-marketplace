#!/usr/bin/env bash

set -euo pipefail
export NODE_ENV=production

NEXT_PID=""
CRYPTO_CRON_PID=""
AI_CRON_PID=""

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

cleanup() {
  if [[ -n "${NEXT_PID}" ]]; then
    kill "${NEXT_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${CRYPTO_CRON_PID}" ]]; then
    kill "${CRYPTO_CRON_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${AI_CRON_PID}" ]]; then
    kill "${AI_CRON_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

./scripts/crypto-rate-cron.sh &
CRYPTO_CRON_PID="$!"

./scripts/ai-repost-cron.sh &
AI_CRON_PID="$!"

./node_modules/.bin/next start -H "${SERVER_HOST}" -p "${PORT}" &
NEXT_PID="$!"

wait "${NEXT_PID}"
