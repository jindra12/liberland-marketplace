#!/usr/bin/env bash

set -e

mkdir -p .local/email-snapshots

pnpm exec maildev \
  --smtp 1025 \
  --web 8025 \
  --ip 127.0.0.1 \
  --web-ip 127.0.0.1 \
  --mail-directory .local/email-snapshots \
  --silent >/tmp/liberland-maildev.log 2>&1 &
MAILDEV_PID=$!

trap 'kill "$MAILDEV_PID" >/dev/null 2>&1 || true' EXIT

NODE_OPTIONS=--no-deprecation ./node_modules/.bin/next dev -H 127.0.0.1
