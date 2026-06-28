#!/usr/bin/env bash

set -euo pipefail
export NODE_ENV=development

MAILDEV_PID=""
CRYPTO_CRON_PID=""
AI_CRON_PID=""
NEXT_PID=""

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

  if [[ -n "${MAILDEV_PID}" ]]; then
    kill "${MAILDEV_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

./maildev.sh &
MAILDEV_PID="$!"

./scripts/crypto-rate-cron.sh &
CRYPTO_CRON_PID="$!"

./scripts/ai-repost-cron.sh &
AI_CRON_PID="$!"

./scripts/next-dev.sh &
NEXT_PID="$!"

wait "${NEXT_PID}"
