#!/usr/bin/env bash

set -euo pipefail

CONTAINER_NAME="liberland-marketplace-mongo-standalone"
IMAGE_NAME="mongo:8.0.19"
HOST_PORT="27018"
CONTAINER_PORT="27017"
CONFIG_VOLUME="liberland-marketplace-mongo-config"
DB_VOLUME="liberland-marketplace-mongo-db"

is_host_port_ready() {
  mongosh --quiet "mongodb://127.0.0.1:${HOST_PORT}/admin" --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1
}

if docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  if is_host_port_ready; then
    exit 0
  fi

  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

docker volume create "${CONFIG_VOLUME}" >/dev/null
docker volume create "${DB_VOLUME}" >/dev/null

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
  -v "${CONFIG_VOLUME}:/data/configdb" \
  -v "${DB_VOLUME}:/data/db" \
  "${IMAGE_NAME}" \
  mongod >/dev/null
