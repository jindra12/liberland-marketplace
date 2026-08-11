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
load_env_file ".env.local"

if [[ "${NODE_ENV:-}" != "production" ]]; then
  load_env_file ".env.development"
  load_env_file ".env.development.local"
fi

PORT="${PORT:-3001}"
CRON_HOST="${CRON_HOST:-127.0.0.1}"
CRON_INTERVAL_SECONDS="${AI_REPOST_REFRESH_INTERVAL_SECONDS:-18000}"
CRON_LOG_FILE="${AI_REPOST_CRON_LOG_FILE:-/tmp/liberland-ai-repost-cron.log}"

CRON_ENDPOINT="http://${CRON_HOST}:${PORT}/api/cron/ai-reposts"

log_cron_message() {
  local message="$1"
  printf '[%s] %s\n' "$(date -Iseconds)" "$message" >> "${CRON_LOG_FILE}"
}

run_ai_repost_request() {
  local response_file
  local response_body
  local response_code

  response_file="$(mktemp)"
  response_code="$(curl -sS --max-time 300 \
    -o "${response_file}" \
    -w '%{http_code}' \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${CRON_ENDPOINT}" || true)"
  response_body="$(tr '\n' ' ' < "${response_file}" | cut -c 1-2000)"
  rm -f "${response_file}"

  if [[ "${response_code}" =~ ^2 ]]; then
    log_cron_message "[ai-repost-cron] Request completed (HTTP ${response_code}): ${response_body}"
    return 0
  fi

  log_cron_message "[ai-repost-cron] Request failed (HTTP ${response_code}): ${response_body}"
  return 1
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
      if run_ai_repost_request; then
        printf '[%s] [ai-repost-cron] Initial refresh completed.\n' "$(date -Iseconds)"
        break
      fi

      sleep 2
    done

    while true; do
      sleep "${CRON_INTERVAL_SECONDS}"

      if run_ai_repost_request; then
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
