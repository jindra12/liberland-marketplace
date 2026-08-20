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
CRON_INTERVAL_SECONDS="${AI_REPOST_REFRESH_INTERVAL_SECONDS:-86400}"
CRON_LOG_FILE="${AI_REPOST_CRON_LOG_FILE:-/tmp/liberland-ai-repost-cron.log}"
CRON_LOCK_FILE="${AI_REPOST_CRON_LOCK_FILE:-/tmp/liberland-ai-repost-cron.lock}"
RATE_LIMIT_RETRY_SECONDS="${AI_REPOST_RATE_LIMIT_RETRY_SECONDS:-60}"

log_cron_message() {
  local message="$1"
  printf '[%s] %s\n' "$(date -Iseconds)" "$message" >> "${CRON_LOG_FILE}"
}

exec 9>>"${CRON_LOCK_FILE}"
if ! flock -n 9; then
  previous_pid="$(tr -d '[:space:]' < "${CRON_LOCK_FILE}" 2>/dev/null || true)"
  previous_command=""

  if [[ "${previous_pid}" =~ ^[0-9]+$ && -r "/proc/${previous_pid}/cmdline" ]]; then
    previous_command="$(tr '\0' ' ' < "/proc/${previous_pid}/cmdline" 2>/dev/null || true)"
  fi

  if [[ "${previous_command}" == *"scripts/ai-repost-cron.sh"* ]]; then
    log_cron_message "[ai-repost-cron] Terminating previous cron process ${previous_pid}."
    previous_children="$(pgrep -P "${previous_pid}" 2>/dev/null || true)"

    if [[ -n "${previous_children}" ]]; then
      kill ${previous_children} >/dev/null 2>&1 || true
    fi

    kill "${previous_pid}" >/dev/null 2>&1 || true
    sleep 1
  else
    log_cron_message "[ai-repost-cron] Lock is held by an unverified process. Exiting safely."
    exit 0
  fi

  if ! flock -n 9; then
    log_cron_message "[ai-repost-cron] Could not acquire the lock after terminating process ${previous_pid}."
    exit 1
  fi
fi

printf '%s\n' "$$" > "${CRON_LOCK_FILE}"
CRON_ENDPOINT="http://${CRON_HOST}:${PORT}/api/cron/ai-reposts"

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

  if [[ "${response_body}" == *"429 Rate limit"* || "${response_body}" == *"tokens per min"* ]]; then
    return 2
  fi

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
    wait "${CRON_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -f "${CRON_LOCK_FILE}" ]] && [[ "$(tr -d '[:space:]' < "${CRON_LOCK_FILE}" 2>/dev/null || true)" == "$$" ]]; then
    rm -f "${CRON_LOCK_FILE}"
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
      else
        request_status="$?"

        if [[ "${request_status}" -eq 2 ]]; then
          log_cron_message "[ai-repost-cron] Rate limited. Retrying in ${RATE_LIMIT_RETRY_SECONDS}s."
          sleep "${RATE_LIMIT_RETRY_SECONDS}"
          continue
        fi
      fi

      sleep 2
    done

    while true; do
      sleep "${CRON_INTERVAL_SECONDS}"

      if run_ai_repost_request; then
        printf '[%s] [ai-repost-cron] Scheduled refresh completed.\n' "$(date -Iseconds)"
      else
        request_status="$?"

        if [[ "${request_status}" -eq 2 ]]; then
          log_cron_message "[ai-repost-cron] Scheduled refresh was rate limited. Retrying in ${RATE_LIMIT_RETRY_SECONDS}s."
        else
          log_cron_message "[ai-repost-cron] Scheduled refresh failed. Retrying in ${RATE_LIMIT_RETRY_SECONDS}s."
        fi

        sleep "${RATE_LIMIT_RETRY_SECONDS}"
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
