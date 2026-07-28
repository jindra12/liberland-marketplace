#!/usr/bin/env bash

set -euo pipefail
export NODE_ENV=development

bash "$(dirname "$0")/test-mongo.sh"

MAILDEV_PID=""
NEXT_PID=""

cleanup() {
  if [[ -n "${NEXT_PID}" ]]; then
    kill "${NEXT_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${MAILDEV_PID}" ]]; then
    kill "${MAILDEV_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

./maildev.sh &
MAILDEV_PID="$!"

./scripts/next-dev.sh &
NEXT_PID="$!"

wait "${NEXT_PID}"
