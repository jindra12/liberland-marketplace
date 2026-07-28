#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-run}"
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
load_env_file ".env.development"
load_env_file ".env.local"
load_env_file ".env.development.local"

PORT="${PORT:-3001}"
CRON_HOST="${CRON_HOST:-127.0.0.1}"
CRON_INTERVAL_SECONDS="${AI_REPOST_REFRESH_INTERVAL_SECONDS:-18000}"
CRON_LOG_FILE="${AI_REPOST_CRON_LOG_FILE:-/tmp/liberland-ai-repost-cron.log}"

CRON_ENDPOINT="http://${CRON_HOST}:${PORT}/api/cron/ai-reposts"

log_cron_message() {
  local message="$1"
  printf '[%s] %s\n' "$(date -Iseconds)" "$message" >> "${CRON_LOG_FILE}"
}

if [[ -z "${CRON_SECRET:-}" && -n "${PAYLOAD_SECRET:-}" ]]; then
  CRON_SECRET="${PAYLOAD_SECRET}"
  export CRON_SECRET
  log_cron_message "[ai-repost-cron] CRON_SECRET is not set. Falling back to PAYLOAD_SECRET for the managed local/server loop."
fi

cleanup() {
  if [[ -n "${CRON_PID}" ]]; then
    kill "${CRON_PID}" >/dev/null 2>&1 || true
  fi
}

start_ai_repost_cron_loop() {
  if [[ -z "${CRON_SECRET:-}" ]]; then
    log_cron_message "[ai-repost-cron] CRON_SECRET is not set. Skipping managed refresh loop."
    return
  fi

  (
    printf '[%s] [ai-repost-cron] Starting managed refresh loop for %s.\n' "$(date -Iseconds)" "${CRON_ENDPOINT}"

    while true; do
      if curl -sS --fail --max-time 120 \
        -H "Authorization: Bearer ${CRON_SECRET}" \
        "${CRON_ENDPOINT}" >/dev/null; then
        printf '[%s] [ai-repost-cron] Initial refresh completed.\n' "$(date -Iseconds)"
        break
      fi

      sleep 2
    done

    while true; do
      sleep "${CRON_INTERVAL_SECONDS}"

      if curl -sS --fail --max-time 120 \
        -H "Authorization: Bearer ${CRON_SECRET}" \
        "${CRON_ENDPOINT}" >/dev/null; then
        printf '[%s] [ai-repost-cron] Scheduled refresh completed.\n' "$(date -Iseconds)"
      else
        printf '[%s] [ai-repost-cron] Scheduled refresh failed.\n' "$(date -Iseconds)"
      fi
    done
  ) >> "${CRON_LOG_FILE}" 2>&1 &

  CRON_PID="$!"
}

trap cleanup EXIT INT TERM

start_ai_repost_cron_loop

if [[ -n "${CRON_PID}" ]]; then
  wait "${CRON_PID}"
fi
