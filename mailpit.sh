#!/usr/bin/env bash

set -e

CONTAINER=liberland-marketplace-mailpit

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --rm --name "$CONTAINER" -p 1025:1025 -p 8025:8025 axllent/mailpit >/dev/null

trap 'docker stop "$CONTAINER" >/dev/null 2>&1 || true' EXIT

NODE_OPTIONS=--no-deprecation next dev
