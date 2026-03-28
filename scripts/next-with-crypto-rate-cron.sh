#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-start}"
PORT="${PORT:-3000}"
SERVER_HOST="${HOST:-127.0.0.1}"
CRON_HOST="${CRON_HOST:-127.0.0.1}"
CRON_INTERVAL_SECONDS="${CRYPTO_RATE_REFRESH_INTERVAL_SECONDS:-300}"
CRON_LOG_FILE="${CRYPTO_RATE_CRON_LOG_FILE:-/tmp/liberland-crypto-rate-cron.log}"
CRON_ENDPOINT="http://${CRON_HOST}:${PORT}/api/cron/crypto-rates"

NEXT_PID=""
CRON_PID=""

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
load_env_file ".env.local"

log_cron_message() {
  local message="$1"
  printf '[%s] %s\n' "$(date -Iseconds)" "$message" >> "${CRON_LOG_FILE}"
}

if [[ -z "${CRON_SECRET:-}" && -n "${PAYLOAD_SECRET:-}" ]]; then
  CRON_SECRET="${PAYLOAD_SECRET}"
  export CRON_SECRET
  log_cron_message "[crypto-rate-cron] CRON_SECRET is not set. Falling back to PAYLOAD_SECRET for the managed local/server loop."
fi

cleanup() {
  if [[ -n "${CRON_PID}" ]]; then
    kill "${CRON_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${NEXT_PID}" ]]; then
    kill "${NEXT_PID}" >/dev/null 2>&1 || true
  fi
}

start_crypto_rate_cron_loop() {
  if [[ -z "${CRON_SECRET:-}" ]]; then
    log_cron_message "[crypto-rate-cron] CRON_SECRET is not set. Skipping managed refresh loop."
    return
  fi

  (
    printf '[%s] [crypto-rate-cron] Starting managed refresh loop for %s.\n' "$(date -Iseconds)" "${CRON_ENDPOINT}"

    while true; do
      if curl -sS --fail --max-time 30 \
        -H "Authorization: Bearer ${CRON_SECRET}" \
        "${CRON_ENDPOINT}" >/dev/null; then
        printf '[%s] [crypto-rate-cron] Initial refresh completed.\n' "$(date -Iseconds)"
        break
      fi

      sleep 2
    done

    while true; do
      sleep "${CRON_INTERVAL_SECONDS}"

      if curl -sS --fail --max-time 30 \
        -H "Authorization: Bearer ${CRON_SECRET}" \
        "${CRON_ENDPOINT}" >/dev/null; then
        printf '[%s] [crypto-rate-cron] Scheduled refresh completed.\n' "$(date -Iseconds)"
      else
        printf '[%s] [crypto-rate-cron] Scheduled refresh failed.\n' "$(date -Iseconds)"
      fi
    done
  ) >> "${CRON_LOG_FILE}" 2>&1 &

  CRON_PID="$!"
}

trap cleanup EXIT INT TERM

start_crypto_rate_cron_loop

./node_modules/.bin/next "${MODE}" -H "${SERVER_HOST}" -p "${PORT}" &
NEXT_PID="$!"

wait "${NEXT_PID}"
