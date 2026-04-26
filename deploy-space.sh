#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jindra12/liberland-marketplace.git}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/liberland-marketplace}"
BRANCH=""
APP_PORT="3001"
MONGO_DB_NAME="liberland"
MONGO_APP_USER="liberland_app"
MONGO_ROOT_USER="rootAdmin"

usage() {
  cat <<'EOF'
Usage: deploy-space.sh [--branch <name>] [-b <name>]

Standalone installer that:
- clones the app from the configured repository URL
- optionally checks out a specific branch
- installs Docker, Git, and HTTPS tooling if needed
- configures local MongoDB, the app, and HTTPS reverse proxying

Environment overrides:
- REPO_URL: git HTTPS URL to clone
- INSTALL_ROOT: target directory for the managed checkout
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)
      if [[ $# -lt 2 ]]; then
        echo "Error: $1 requires a branch name." >&2
        exit 1
      fi
      BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$1'." >&2
      usage
      exit 1
      ;;
  esac
done

SOURCE_DIR="$INSTALL_ROOT/source"
DEPLOY_DIR="$SOURCE_DIR/.deploy"
RUNTIME_ENV_FILE="$DEPLOY_DIR/runtime.env"
DOCKERFILE_FILE="$DEPLOY_DIR/Dockerfile"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
MONGO_INIT_FILE="$DEPLOY_DIR/mongo-init.js"
CADDYFILE_FILE="$DEPLOY_DIR/Caddyfile"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

run_sudo() {
  "${SUDO[@]}" "$@"
}

run_docker() {
  "${SUDO[@]}" docker "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' was not found." >&2
    exit 1
  fi
}

prompt_value() {
  local __target="$1"
  local __label="$2"
  local __default="${3:-}"
  local __value=""

  if [[ -n "$__default" ]]; then
    read -r -p "$__label [$__default]: " __value
    __value="${__value:-$__default}"
  else
    read -r -p "$__label: " __value
  fi

  printf -v "$__target" '%s' "$__value"
}

prompt_value_or_env() {
  local __target="$1"
  local __env_name="$2"
  local __label="$3"
  local __default="${4:-}"
  local __value="${!__env_name:-}"

  if [[ -n "$__value" ]]; then
    printf -v "$__target" '%s' "$__value"
    return
  fi

  prompt_value "$__target" "$__label" "$__default"
}

prompt_secret_or_generate() {
  local __target="$1"
  local __label="$2"
  local __default="${3:-}"
  local __value=""

  if [[ -n "$__default" ]]; then
    read -r -s -p "$__label [press Enter to keep generated default]: " __value
    echo
    if [[ -z "$__value" ]]; then
      __value="$__default"
    fi
  else
    read -r -s -p "$__label [press Enter to auto-generate]: " __value
    echo
    if [[ -z "$__value" ]]; then
      __value="$(generate_secret)"
    fi
  fi

  printf -v "$__target" '%s' "$__value"
}

prompt_secret_or_generate_or_env() {
  local __target="$1"
  local __env_name="$2"
  local __label="$3"
  local __default="${4:-}"
  local __value="${!__env_name:-}"

  if [[ -n "$__value" ]]; then
    printf -v "$__target" '%s' "$__value"
    return
  fi

  prompt_secret_or_generate "$__target" "$__label" "$__default"
}

prompt_required_secret() {
  local __target="$1"
  local __label="$2"
  local __value=""

  while [[ -z "$__value" ]]; do
    read -r -s -p "$__label: " __value
    echo
    if [[ -z "$__value" ]]; then
      echo "This value cannot be empty." >&2
    fi
  done

  printf -v "$__target" '%s' "$__value"
}

prompt_required_secret_or_env() {
  local __target="$1"
  local __env_name="$2"
  local __label="$3"
  local __value="${!__env_name:-}"

  if [[ -n "$__value" ]]; then
    printf -v "$__target" '%s' "$__value"
    return
  fi

  prompt_required_secret "$__target" "$__label"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  tr -dc 'a-f0-9' </dev/urandom | head -c 64
}

quote_env_value() {
  local raw="$1"
  local escaped="${raw//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  printf '"%s"' "$escaped"
}

write_env_line() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$(quote_env_value "$value")" >> "$RUNTIME_ENV_FILE"
}

ensure_docker_engine() {
  run_sudo apt-get update
  run_sudo apt-get install -y ca-certificates curl gnupg openssl git

  if docker info >/dev/null 2>&1; then
    return
  fi

  echo "Installing Docker and supporting packages..."
  run_sudo apt-get install -y docker.io docker-compose-plugin
  run_sudo systemctl enable --now docker

  if command -v ufw >/dev/null 2>&1; then
    run_sudo ufw allow 80/tcp >/dev/null 2>&1 || true
    run_sudo ufw allow 443/tcp >/dev/null 2>&1 || true
  fi
}

prepare_source_checkout() {
  mkdir -p "$INSTALL_ROOT"

  if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    if [[ -n "$BRANCH" ]]; then
      git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$SOURCE_DIR"
    else
      git clone "$REPO_URL" "$SOURCE_DIR"
    fi
    return
  fi

  if [[ -n "$BRANCH" ]]; then
    git -C "$SOURCE_DIR" fetch origin "$BRANCH"
    git -C "$SOURCE_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
    return
  fi

  current_branch="$(git -C "$SOURCE_DIR" branch --show-current)"
  if [[ -z "$current_branch" ]]; then
    current_branch="$(git -C "$SOURCE_DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
    current_branch="${current_branch#origin/}"
  fi
  if [[ -z "$current_branch" ]]; then
    current_branch="main"
  fi

  git -C "$SOURCE_DIR" checkout "$current_branch" >/dev/null 2>&1 || \
    git -C "$SOURCE_DIR" checkout -B "$current_branch" "origin/$current_branch"
  git -C "$SOURCE_DIR" pull --ff-only origin "$current_branch"
}

detect_public_ip() {
  local ip=""

  if ip="$(curl -4 -fsS https://api.ipify.org 2>/dev/null)"; then
    printf '%s' "$ip"
    return
  fi

  read -r -p "Could not auto-detect the public IPv4 address. Enter it manually: " ip
  if [[ -z "$ip" ]]; then
    echo "Error: public IP address is required to build the nip.io hostname." >&2
    exit 1
  fi

  printf '%s' "$ip"
}

make_nip_domain() {
  local public_ip="$1"
  local ip_suffix="${public_ip//./-}"
  printf 'marketplace-%s.nip.io' "$ip_suffix"
}

exported_vars=()
set_and_export() {
  local name="$1"
  local value="$2"
  printf -v "$name" '%s' "$value"
  export "$name"
  exported_vars+=("$name")
}

ensure_docker_engine
prepare_source_checkout
mkdir -p "$DEPLOY_DIR"

PUBLIC_IP="$(detect_public_ip)"
DEFAULT_DOMAIN="$(make_nip_domain "$PUBLIC_IP")"

echo
echo "Using free wildcard DNS via nip.io:"
echo "  Public IP: $PUBLIC_IP"
echo "  Default domain: https://$DEFAULT_DOMAIN"
echo

prompt_value_or_env APP_DOMAIN APP_DOMAIN "Domain to deploy on" "$DEFAULT_DOMAIN"

prompt_secret_or_generate_or_env PAYLOAD_SECRET PAYLOAD_SECRET "PAYLOAD_SECRET (Payload CMS signing secret)"

prompt_secret_or_generate_or_env BETTER_AUTH_SECRET BETTER_AUTH_SECRET "BETTER_AUTH_SECRET (Better Auth signing secret)"

prompt_secret_or_generate_or_env CRON_SECRET CRON_SECRET "CRON_SECRET (cron auth secret)" "$PAYLOAD_SECRET"

prompt_secret_or_generate_or_env PREVIEW_SECRET PREVIEW_SECRET "PREVIEW_SECRET (draft/preview protection secret)"

PAYLOAD_DEBUG="false"
PAYLOAD_ENABLE_LIVE_PREVIEW="false"
PAYLOAD_LOG_LEVEL="info"

prompt_value_or_env SMTP_HOST SMTP_HOST "SMTP_HOST (verification email server)" "smtp.example.com"

prompt_value_or_env SMTP_PORT SMTP_PORT "SMTP_PORT (usually 587 for STARTTLS)" "587"

prompt_value_or_env SMTP_USER SMTP_USER "SMTP_USER (SMTP login)" "your-smtp-user"

prompt_required_secret_or_env SMTP_PASS SMTP_PASS "SMTP_PASS (SMTP password or app password)"

prompt_value_or_env SMTP_FROM_ADDRESS SMTP_FROM_ADDRESS "SMTP_FROM_ADDRESS (sender email)" "noreply@${APP_DOMAIN}"

prompt_value_or_env SMTP_FROM_NAME SMTP_FROM_NAME "SMTP_FROM_NAME (sender display name)" "Liberland Marketplace"

prompt_value_or_env THIRDWEB_SECRET_KEY THIRDWEB_SECRET_KEY "THIRDWEB_SECRET_KEY (recommended; leave blank to use a client id)" ""

if [[ -z "$THIRDWEB_SECRET_KEY" ]]; then
  prompt_value_or_env THIRDWEB_CLIENT_ID THIRDWEB_CLIENT_ID "THIRDWEB_CLIENT_ID (public fallback if you do not use a secret key)" ""
fi

prompt_value_or_env TRONWEB_API TRONWEB_API "TRONWEB_API (TronGrid or your Tron node API)" "https://api.trongrid.io"

prompt_value_or_env TRONWEB_SECRET TRONWEB_SECRET "TRONWEB_SECRET (optional TronGrid API key)" ""

CRYPTO_ETH_NATIVE_TOKEN_ADDRESS="0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2"
CRYPTO_ETH_STABLE_TOKEN_ADDRESS="0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
CRYPTO_ETH_POOL_ADDRESS="0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"
CRYPTO_ETH_NATIVE_TOKEN_SYMBOL="ETH"
CRYPTO_ETH_STABLE_TOKEN_SYMBOL="USDC"
CRYPTO_ETH_NATIVE_TOKEN_DECIMALS="18"
CRYPTO_ETH_STABLE_TOKEN_DECIMALS="6"

CRYPTO_SOL_RPC_URL="https://api.mainnet-beta.solana.com"
CRYPTO_SOL_POOL_ADDRESS="58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS="DQyrAcCrDXQ7NeoqGgDCZwBvWDcYmFCjSb9JtteuvPpz"
CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS="HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz"
CRYPTO_SOL_NATIVE_TOKEN_SYMBOL="SOL"
CRYPTO_SOL_STABLE_TOKEN_SYMBOL="USDC"

CRYPTO_TRON_POOL_ADDRESS="TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ"
CRYPTO_TRON_NATIVE_TOKEN_ADDRESS="TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR"
CRYPTO_TRON_STABLE_TOKEN_ADDRESS="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
CRYPTO_TRON_NATIVE_TOKEN_SYMBOL="TRX"
CRYPTO_TRON_STABLE_TOKEN_SYMBOL="USDT"
CRYPTO_TRON_NATIVE_TOKEN_DECIMALS="6"
CRYPTO_TRON_STABLE_TOKEN_DECIMALS="6"

CRYPTO_RATE_FETCH_TIMEOUT_MS="60000"
CRYPTO_RATE_REFRESH_INTERVAL_SECONDS="300"
CRYPTO_RATE_CACHE_MAX_AGE_MS="900000"
CRYPTO_ETH_RPC_TIMEOUT_MS="8000"

MONGO_INITDB_ROOT_USERNAME="$MONGO_ROOT_USER"
MONGO_INITDB_ROOT_PASSWORD="$(generate_secret)"
MONGO_APP_DB_NAME="$MONGO_DB_NAME"
MONGO_APP_USER="$MONGO_APP_USER"
MONGO_APP_PASSWORD="$(generate_secret)"

DATABASE_URL="mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@mongo:27017/${MONGO_DB_NAME}?authSource=${MONGO_DB_NAME}&replicaSet=rs0"
NEXT_PUBLIC_SERVER_URL="https://${APP_DOMAIN}"
NEXT_PUBLIC_FRONTEND_URL="$NEXT_PUBLIC_SERVER_URL"
FRONTEND_URL="$NEXT_PUBLIC_SERVER_URL"
HOST="0.0.0.0"
PORT="$APP_PORT"
CRON_HOST="127.0.0.1"

set_and_export APP_DOMAIN "$APP_DOMAIN"
set_and_export PAYLOAD_SECRET "$PAYLOAD_SECRET"
set_and_export BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
set_and_export CRON_SECRET "$CRON_SECRET"
set_and_export PREVIEW_SECRET "$PREVIEW_SECRET"
set_and_export PAYLOAD_DEBUG "$PAYLOAD_DEBUG"
set_and_export PAYLOAD_ENABLE_LIVE_PREVIEW "$PAYLOAD_ENABLE_LIVE_PREVIEW"
set_and_export PAYLOAD_LOG_LEVEL "$PAYLOAD_LOG_LEVEL"
set_and_export SMTP_HOST "$SMTP_HOST"
set_and_export SMTP_PORT "$SMTP_PORT"
set_and_export SMTP_USER "$SMTP_USER"
set_and_export SMTP_PASS "$SMTP_PASS"
set_and_export SMTP_FROM_ADDRESS "$SMTP_FROM_ADDRESS"
set_and_export SMTP_FROM_NAME "$SMTP_FROM_NAME"
set_and_export THIRDWEB_SECRET_KEY "$THIRDWEB_SECRET_KEY"
set_and_export THIRDWEB_CLIENT_ID "$THIRDWEB_CLIENT_ID"
set_and_export TRONWEB_API "$TRONWEB_API"
set_and_export TRONWEB_SECRET "$TRONWEB_SECRET"
set_and_export CRYPTO_ETH_NATIVE_TOKEN_ADDRESS "$CRYPTO_ETH_NATIVE_TOKEN_ADDRESS"
set_and_export CRYPTO_ETH_STABLE_TOKEN_ADDRESS "$CRYPTO_ETH_STABLE_TOKEN_ADDRESS"
set_and_export CRYPTO_ETH_POOL_ADDRESS "$CRYPTO_ETH_POOL_ADDRESS"
set_and_export CRYPTO_ETH_NATIVE_TOKEN_SYMBOL "$CRYPTO_ETH_NATIVE_TOKEN_SYMBOL"
set_and_export CRYPTO_ETH_STABLE_TOKEN_SYMBOL "$CRYPTO_ETH_STABLE_TOKEN_SYMBOL"
set_and_export CRYPTO_ETH_NATIVE_TOKEN_DECIMALS "$CRYPTO_ETH_NATIVE_TOKEN_DECIMALS"
set_and_export CRYPTO_ETH_STABLE_TOKEN_DECIMALS "$CRYPTO_ETH_STABLE_TOKEN_DECIMALS"
set_and_export CRYPTO_SOL_RPC_URL "$CRYPTO_SOL_RPC_URL"
set_and_export CRYPTO_SOL_POOL_ADDRESS "$CRYPTO_SOL_POOL_ADDRESS"
set_and_export CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS "$CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS"
set_and_export CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS "$CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS"
set_and_export CRYPTO_SOL_NATIVE_TOKEN_SYMBOL "$CRYPTO_SOL_NATIVE_TOKEN_SYMBOL"
set_and_export CRYPTO_SOL_STABLE_TOKEN_SYMBOL "$CRYPTO_SOL_STABLE_TOKEN_SYMBOL"
set_and_export CRYPTO_TRON_POOL_ADDRESS "$CRYPTO_TRON_POOL_ADDRESS"
set_and_export CRYPTO_TRON_NATIVE_TOKEN_ADDRESS "$CRYPTO_TRON_NATIVE_TOKEN_ADDRESS"
set_and_export CRYPTO_TRON_STABLE_TOKEN_ADDRESS "$CRYPTO_TRON_STABLE_TOKEN_ADDRESS"
set_and_export CRYPTO_TRON_NATIVE_TOKEN_SYMBOL "$CRYPTO_TRON_NATIVE_TOKEN_SYMBOL"
set_and_export CRYPTO_TRON_STABLE_TOKEN_SYMBOL "$CRYPTO_TRON_STABLE_TOKEN_SYMBOL"
set_and_export CRYPTO_TRON_NATIVE_TOKEN_DECIMALS "$CRYPTO_TRON_NATIVE_TOKEN_DECIMALS"
set_and_export CRYPTO_TRON_STABLE_TOKEN_DECIMALS "$CRYPTO_TRON_STABLE_TOKEN_DECIMALS"
set_and_export CRYPTO_RATE_FETCH_TIMEOUT_MS "$CRYPTO_RATE_FETCH_TIMEOUT_MS"
set_and_export CRYPTO_RATE_REFRESH_INTERVAL_SECONDS "$CRYPTO_RATE_REFRESH_INTERVAL_SECONDS"
set_and_export CRYPTO_RATE_CACHE_MAX_AGE_MS "$CRYPTO_RATE_CACHE_MAX_AGE_MS"
set_and_export CRYPTO_ETH_RPC_TIMEOUT_MS "$CRYPTO_ETH_RPC_TIMEOUT_MS"
set_and_export MONGO_INITDB_ROOT_USERNAME "$MONGO_INITDB_ROOT_USERNAME"
set_and_export MONGO_INITDB_ROOT_PASSWORD "$MONGO_INITDB_ROOT_PASSWORD"
set_and_export MONGO_APP_DB_NAME "$MONGO_APP_DB_NAME"
set_and_export MONGO_APP_USER "$MONGO_APP_USER"
set_and_export MONGO_APP_PASSWORD "$MONGO_APP_PASSWORD"
set_and_export DATABASE_URL "$DATABASE_URL"
set_and_export NEXT_PUBLIC_SERVER_URL "$NEXT_PUBLIC_SERVER_URL"
set_and_export NEXT_PUBLIC_FRONTEND_URL "$NEXT_PUBLIC_FRONTEND_URL"
set_and_export FRONTEND_URL "$FRONTEND_URL"
set_and_export HOST "$HOST"
set_and_export PORT "$PORT"
set_and_export CRON_HOST "$CRON_HOST"

cat > "$RUNTIME_ENV_FILE" <<EOF
# Generated by deploy-space.sh on $(date -Iseconds)
APP_DOMAIN=$(quote_env_value "$APP_DOMAIN")
PAYLOAD_SECRET=$(quote_env_value "$PAYLOAD_SECRET")
BETTER_AUTH_SECRET=$(quote_env_value "$BETTER_AUTH_SECRET")
CRON_SECRET=$(quote_env_value "$CRON_SECRET")
PREVIEW_SECRET=$(quote_env_value "$PREVIEW_SECRET")
PAYLOAD_DEBUG=$(quote_env_value "$PAYLOAD_DEBUG")
PAYLOAD_ENABLE_LIVE_PREVIEW=$(quote_env_value "$PAYLOAD_ENABLE_LIVE_PREVIEW")
PAYLOAD_LOG_LEVEL=$(quote_env_value "$PAYLOAD_LOG_LEVEL")
SMTP_HOST=$(quote_env_value "$SMTP_HOST")
SMTP_PORT=$(quote_env_value "$SMTP_PORT")
SMTP_USER=$(quote_env_value "$SMTP_USER")
SMTP_PASS=$(quote_env_value "$SMTP_PASS")
SMTP_FROM_ADDRESS=$(quote_env_value "$SMTP_FROM_ADDRESS")
SMTP_FROM_NAME=$(quote_env_value "$SMTP_FROM_NAME")
THIRDWEB_SECRET_KEY=$(quote_env_value "$THIRDWEB_SECRET_KEY")
THIRDWEB_CLIENT_ID=$(quote_env_value "$THIRDWEB_CLIENT_ID")
TRONWEB_API=$(quote_env_value "$TRONWEB_API")
TRONWEB_SECRET=$(quote_env_value "$TRONWEB_SECRET")
CRYPTO_ETH_POOL_ADDRESS=$(quote_env_value "$CRYPTO_ETH_POOL_ADDRESS")
CRYPTO_ETH_NATIVE_TOKEN_ADDRESS=$(quote_env_value "$CRYPTO_ETH_NATIVE_TOKEN_ADDRESS")
CRYPTO_ETH_STABLE_TOKEN_ADDRESS=$(quote_env_value "$CRYPTO_ETH_STABLE_TOKEN_ADDRESS")
CRYPTO_ETH_NATIVE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_ETH_NATIVE_TOKEN_SYMBOL")
CRYPTO_ETH_STABLE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_ETH_STABLE_TOKEN_SYMBOL")
CRYPTO_ETH_NATIVE_TOKEN_DECIMALS=$(quote_env_value "$CRYPTO_ETH_NATIVE_TOKEN_DECIMALS")
CRYPTO_ETH_STABLE_TOKEN_DECIMALS=$(quote_env_value "$CRYPTO_ETH_STABLE_TOKEN_DECIMALS")
CRYPTO_SOL_RPC_URL=$(quote_env_value "$CRYPTO_SOL_RPC_URL")
CRYPTO_SOL_POOL_ADDRESS=$(quote_env_value "$CRYPTO_SOL_POOL_ADDRESS")
CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS=$(quote_env_value "$CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS")
CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS=$(quote_env_value "$CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS")
CRYPTO_SOL_NATIVE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_SOL_NATIVE_TOKEN_SYMBOL")
CRYPTO_SOL_STABLE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_SOL_STABLE_TOKEN_SYMBOL")
CRYPTO_TRON_POOL_ADDRESS=$(quote_env_value "$CRYPTO_TRON_POOL_ADDRESS")
CRYPTO_TRON_NATIVE_TOKEN_ADDRESS=$(quote_env_value "$CRYPTO_TRON_NATIVE_TOKEN_ADDRESS")
CRYPTO_TRON_STABLE_TOKEN_ADDRESS=$(quote_env_value "$CRYPTO_TRON_STABLE_TOKEN_ADDRESS")
CRYPTO_TRON_NATIVE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_TRON_NATIVE_TOKEN_SYMBOL")
CRYPTO_TRON_STABLE_TOKEN_SYMBOL=$(quote_env_value "$CRYPTO_TRON_STABLE_TOKEN_SYMBOL")
CRYPTO_TRON_NATIVE_TOKEN_DECIMALS=$(quote_env_value "$CRYPTO_TRON_NATIVE_TOKEN_DECIMALS")
CRYPTO_TRON_STABLE_TOKEN_DECIMALS=$(quote_env_value "$CRYPTO_TRON_STABLE_TOKEN_DECIMALS")
CRYPTO_RATE_FETCH_TIMEOUT_MS=$(quote_env_value "$CRYPTO_RATE_FETCH_TIMEOUT_MS")
CRYPTO_RATE_REFRESH_INTERVAL_SECONDS=$(quote_env_value "$CRYPTO_RATE_REFRESH_INTERVAL_SECONDS")
CRYPTO_RATE_CACHE_MAX_AGE_MS=$(quote_env_value "$CRYPTO_RATE_CACHE_MAX_AGE_MS")
CRYPTO_ETH_RPC_TIMEOUT_MS=$(quote_env_value "$CRYPTO_ETH_RPC_TIMEOUT_MS")
MONGO_INITDB_ROOT_USERNAME=$(quote_env_value "$MONGO_INITDB_ROOT_USERNAME")
MONGO_INITDB_ROOT_PASSWORD=$(quote_env_value "$MONGO_INITDB_ROOT_PASSWORD")
MONGO_APP_DB_NAME=$(quote_env_value "$MONGO_APP_DB_NAME")
MONGO_APP_USER=$(quote_env_value "$MONGO_APP_USER")
MONGO_APP_PASSWORD=$(quote_env_value "$MONGO_APP_PASSWORD")
DATABASE_URL=$(quote_env_value "$DATABASE_URL")
NEXT_PUBLIC_SERVER_URL=$(quote_env_value "$NEXT_PUBLIC_SERVER_URL")
NEXT_PUBLIC_FRONTEND_URL=$(quote_env_value "$NEXT_PUBLIC_FRONTEND_URL")
FRONTEND_URL=$(quote_env_value "$FRONTEND_URL")
HOST=$(quote_env_value "$HOST")
PORT=$(quote_env_value "$PORT")
CRON_HOST=$(quote_env_value "$CRON_HOST")
EOF

cat > "$MONGO_INIT_FILE" <<'EOF'
const appDbName = process.env.MONGO_APP_DB_NAME
const appUser = process.env.MONGO_APP_USER
const appPassword = process.env.MONGO_APP_PASSWORD
const rootHost = process.env.MONGO_REPLICA_HOST || 'mongo:27017'

if (!appDbName || !appUser || !appPassword) {
  throw new Error('Missing MongoDB bootstrap variables.')
}

const adminDb = db.getSiblingDB('admin')

let replicaReady = false
try {
  const status = adminDb.runCommand({ replSetGetStatus: 1 })
  replicaReady = status.ok === 1
} catch {
  replicaReady = false
}

if (!replicaReady) {
  try {
    rs.initiate({
      _id: 'rs0',
      members: [{ _id: 0, host: rootHost }],
    })
  } catch (error) {
    if (!String(error).includes('already initialized')) {
      throw error
    }
  }
}

let writablePrimary = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const hello = adminDb.runCommand({ hello: 1 })
    if (hello.isWritablePrimary === true) {
      writablePrimary = true
      break
    }
  } catch {
    // Retry until the replica set stabilizes.
  }

  sleep(1000)
}

if (!writablePrimary) {
  throw new Error('MongoDB replica set never became writable.')
}

const appDb = db.getSiblingDB(appDbName)
const appRoles = [{ role: 'readWrite', db: appDbName }]

if (appDb.getUser(appUser)) {
  appDb.updateUser(appUser, {
    pwd: appPassword,
    roles: appRoles,
  })
} else {
  appDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: appRoles,
  })
}

print(`MongoDB app user ready for database: ${appDbName}`)
EOF

cat > "$DOCKERFILE_FILE" <<'EOF'
FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

ARG APP_DOMAIN
ARG BETTER_AUTH_SECRET
ARG CRON_HOST
ARG CRON_SECRET
ARG CRYPTO_ETH_NATIVE_TOKEN_ADDRESS
ARG CRYPTO_ETH_NATIVE_TOKEN_DECIMALS
ARG CRYPTO_ETH_NATIVE_TOKEN_SYMBOL
ARG CRYPTO_ETH_POOL_ADDRESS
ARG CRYPTO_ETH_RPC_TIMEOUT_MS
ARG CRYPTO_ETH_STABLE_TOKEN_ADDRESS
ARG CRYPTO_ETH_STABLE_TOKEN_DECIMALS
ARG CRYPTO_ETH_STABLE_TOKEN_SYMBOL
ARG CRYPTO_RATE_CACHE_MAX_AGE_MS
ARG CRYPTO_RATE_FETCH_TIMEOUT_MS
ARG CRYPTO_RATE_REFRESH_INTERVAL_SECONDS
ARG CRYPTO_SOL_NATIVE_TOKEN_SYMBOL
ARG CRYPTO_SOL_POOL_ADDRESS
ARG CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS
ARG CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS
ARG CRYPTO_SOL_RPC_URL
ARG CRYPTO_SOL_STABLE_TOKEN_SYMBOL
ARG CRYPTO_TRON_NATIVE_TOKEN_ADDRESS
ARG CRYPTO_TRON_NATIVE_TOKEN_DECIMALS
ARG CRYPTO_TRON_NATIVE_TOKEN_SYMBOL
ARG CRYPTO_TRON_POOL_ADDRESS
ARG CRYPTO_TRON_STABLE_TOKEN_ADDRESS
ARG CRYPTO_TRON_STABLE_TOKEN_DECIMALS
ARG CRYPTO_TRON_STABLE_TOKEN_SYMBOL
ARG DATABASE_URL
ARG FRONTEND_URL
ARG HOST
ARG MONGO_APP_DB_NAME
ARG MONGO_APP_PASSWORD
ARG MONGO_APP_USER
ARG MONGO_INITDB_ROOT_PASSWORD
ARG MONGO_INITDB_ROOT_USERNAME
ARG NEXT_PUBLIC_FRONTEND_URL
ARG NEXT_PUBLIC_SERVER_URL
ARG PAYLOAD_SECRET
ARG PAYLOAD_LOG_LEVEL
ARG PAYLOAD_DEBUG
ARG PAYLOAD_ENABLE_LIVE_PREVIEW
ARG PORT
ARG PREVIEW_SECRET
ARG SMTP_FROM_ADDRESS
ARG SMTP_FROM_NAME
ARG SMTP_HOST
ARG SMTP_PASS
ARG SMTP_PORT
ARG SMTP_USER
ARG THIRDWEB_CLIENT_ID
ARG THIRDWEB_SECRET_KEY
ARG TRONWEB_API
ARG TRONWEB_SECRET

ENV APP_DOMAIN=$APP_DOMAIN
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV CRON_HOST=$CRON_HOST
ENV CRON_SECRET=$CRON_SECRET
ENV CRYPTO_ETH_NATIVE_TOKEN_ADDRESS=$CRYPTO_ETH_NATIVE_TOKEN_ADDRESS
ENV CRYPTO_ETH_NATIVE_TOKEN_DECIMALS=$CRYPTO_ETH_NATIVE_TOKEN_DECIMALS
ENV CRYPTO_ETH_NATIVE_TOKEN_SYMBOL=$CRYPTO_ETH_NATIVE_TOKEN_SYMBOL
ENV CRYPTO_ETH_POOL_ADDRESS=$CRYPTO_ETH_POOL_ADDRESS
ENV CRYPTO_ETH_RPC_TIMEOUT_MS=$CRYPTO_ETH_RPC_TIMEOUT_MS
ENV CRYPTO_ETH_STABLE_TOKEN_ADDRESS=$CRYPTO_ETH_STABLE_TOKEN_ADDRESS
ENV CRYPTO_ETH_STABLE_TOKEN_DECIMALS=$CRYPTO_ETH_STABLE_TOKEN_DECIMALS
ENV CRYPTO_ETH_STABLE_TOKEN_SYMBOL=$CRYPTO_ETH_STABLE_TOKEN_SYMBOL
ENV CRYPTO_RATE_CACHE_MAX_AGE_MS=$CRYPTO_RATE_CACHE_MAX_AGE_MS
ENV CRYPTO_RATE_FETCH_TIMEOUT_MS=$CRYPTO_RATE_FETCH_TIMEOUT_MS
ENV CRYPTO_RATE_REFRESH_INTERVAL_SECONDS=$CRYPTO_RATE_REFRESH_INTERVAL_SECONDS
ENV CRYPTO_SOL_NATIVE_TOKEN_SYMBOL=$CRYPTO_SOL_NATIVE_TOKEN_SYMBOL
ENV CRYPTO_SOL_POOL_ADDRESS=$CRYPTO_SOL_POOL_ADDRESS
ENV CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS=$CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS
ENV CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS=$CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS
ENV CRYPTO_SOL_RPC_URL=$CRYPTO_SOL_RPC_URL
ENV CRYPTO_SOL_STABLE_TOKEN_SYMBOL=$CRYPTO_SOL_STABLE_TOKEN_SYMBOL
ENV CRYPTO_TRON_NATIVE_TOKEN_ADDRESS=$CRYPTO_TRON_NATIVE_TOKEN_ADDRESS
ENV CRYPTO_TRON_NATIVE_TOKEN_DECIMALS=$CRYPTO_TRON_NATIVE_TOKEN_DECIMALS
ENV CRYPTO_TRON_NATIVE_TOKEN_SYMBOL=$CRYPTO_TRON_NATIVE_TOKEN_SYMBOL
ENV CRYPTO_TRON_POOL_ADDRESS=$CRYPTO_TRON_POOL_ADDRESS
ENV CRYPTO_TRON_STABLE_TOKEN_ADDRESS=$CRYPTO_TRON_STABLE_TOKEN_ADDRESS
ENV CRYPTO_TRON_STABLE_TOKEN_DECIMALS=$CRYPTO_TRON_STABLE_TOKEN_DECIMALS
ENV CRYPTO_TRON_STABLE_TOKEN_SYMBOL=$CRYPTO_TRON_STABLE_TOKEN_SYMBOL
ENV DATABASE_URL=$DATABASE_URL
ENV FRONTEND_URL=$FRONTEND_URL
ENV HOST=$HOST
ENV MONGO_APP_DB_NAME=$MONGO_APP_DB_NAME
ENV MONGO_APP_PASSWORD=$MONGO_APP_PASSWORD
ENV MONGO_APP_USER=$MONGO_APP_USER
ENV MONGO_INITDB_ROOT_PASSWORD=$MONGO_INITDB_ROOT_PASSWORD
ENV MONGO_INITDB_ROOT_USERNAME=$MONGO_INITDB_ROOT_USERNAME
ENV NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV PAYLOAD_DEBUG=$PAYLOAD_DEBUG
ENV PAYLOAD_ENABLE_LIVE_PREVIEW=$PAYLOAD_ENABLE_LIVE_PREVIEW
ENV PAYLOAD_LOG_LEVEL=$PAYLOAD_LOG_LEVEL
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
ENV PORT=$PORT
ENV PREVIEW_SECRET=$PREVIEW_SECRET
ENV SMTP_FROM_ADDRESS=$SMTP_FROM_ADDRESS
ENV SMTP_FROM_NAME=$SMTP_FROM_NAME
ENV SMTP_HOST=$SMTP_HOST
ENV SMTP_PASS=$SMTP_PASS
ENV SMTP_PORT=$SMTP_PORT
ENV SMTP_USER=$SMTP_USER
ENV THIRDWEB_CLIENT_ID=$THIRDWEB_CLIENT_ID
ENV THIRDWEB_SECRET_KEY=$THIRDWEB_SECRET_KEY
ENV TRONWEB_API=$TRONWEB_API
ENV TRONWEB_SECRET=$TRONWEB_SECRET

RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY --from=build /app /app

EXPOSE 3001

CMD ["pnpm", "start"]
EOF

cat > "$CADDYFILE_FILE" <<EOF
$APP_DOMAIN {
  encode zstd gzip
  reverse_proxy app:$APP_PORT
}
EOF

cat > "$COMPOSE_FILE" <<EOF
services:
  mongo:
    image: mongo:8.0
    command:
      - mongod
      - --replSet
      - rs0
      - --bind_ip_all
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${MONGO_INITDB_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_INITDB_ROOT_PASSWORD}
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "mongosh --quiet --host localhost -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1",
        ]
      interval: 5s
      timeout: 5s
      retries: 30
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  mongo-init:
    image: mongo:8.0
    depends_on:
      mongo:
        condition: service_healthy
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${MONGO_INITDB_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_INITDB_ROOT_PASSWORD}
      MONGO_APP_DB_NAME: \${MONGO_APP_DB_NAME}
      MONGO_APP_USER: \${MONGO_APP_USER}
      MONGO_APP_PASSWORD: \${MONGO_APP_PASSWORD}
      MONGO_REPLICA_HOST: mongo:27017
    volumes:
      - ./mongo-init.js:/mongo-init.js:ro
    command:
      - sh
      - -lc
      - |
        until mongosh "mongodb://\${MONGO_INITDB_ROOT_USERNAME}:\${MONGO_INITDB_ROOT_PASSWORD}@mongo:27017/admin?directConnection=true" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; do
          sleep 2
        done
        mongosh "mongodb://\${MONGO_INITDB_ROOT_USERNAME}:\${MONGO_INITDB_ROOT_PASSWORD}@mongo:27017/admin?directConnection=true" --quiet /mongo-init.js
    restart: "no"

  app:
    build:
      context: ..
      dockerfile: .deploy/Dockerfile
      args:
        APP_DOMAIN: \${APP_DOMAIN}
        BETTER_AUTH_SECRET: \${BETTER_AUTH_SECRET}
        CRON_HOST: \${CRON_HOST}
        CRON_SECRET: \${CRON_SECRET}
        CRYPTO_ETH_NATIVE_TOKEN_ADDRESS: \${CRYPTO_ETH_NATIVE_TOKEN_ADDRESS}
        CRYPTO_ETH_NATIVE_TOKEN_DECIMALS: \${CRYPTO_ETH_NATIVE_TOKEN_DECIMALS}
        CRYPTO_ETH_NATIVE_TOKEN_SYMBOL: \${CRYPTO_ETH_NATIVE_TOKEN_SYMBOL}
        CRYPTO_ETH_POOL_ADDRESS: \${CRYPTO_ETH_POOL_ADDRESS}
        CRYPTO_ETH_RPC_TIMEOUT_MS: \${CRYPTO_ETH_RPC_TIMEOUT_MS}
        CRYPTO_ETH_STABLE_TOKEN_ADDRESS: \${CRYPTO_ETH_STABLE_TOKEN_ADDRESS}
        CRYPTO_ETH_STABLE_TOKEN_DECIMALS: \${CRYPTO_ETH_STABLE_TOKEN_DECIMALS}
        CRYPTO_ETH_STABLE_TOKEN_SYMBOL: \${CRYPTO_ETH_STABLE_TOKEN_SYMBOL}
        CRYPTO_RATE_CACHE_MAX_AGE_MS: \${CRYPTO_RATE_CACHE_MAX_AGE_MS}
        CRYPTO_RATE_FETCH_TIMEOUT_MS: \${CRYPTO_RATE_FETCH_TIMEOUT_MS}
        CRYPTO_RATE_REFRESH_INTERVAL_SECONDS: \${CRYPTO_RATE_REFRESH_INTERVAL_SECONDS}
        CRYPTO_SOL_NATIVE_TOKEN_SYMBOL: \${CRYPTO_SOL_NATIVE_TOKEN_SYMBOL}
        CRYPTO_SOL_POOL_ADDRESS: \${CRYPTO_SOL_POOL_ADDRESS}
        CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS: \${CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS}
        CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS: \${CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS}
        CRYPTO_SOL_RPC_URL: \${CRYPTO_SOL_RPC_URL}
        CRYPTO_SOL_STABLE_TOKEN_SYMBOL: \${CRYPTO_SOL_STABLE_TOKEN_SYMBOL}
        CRYPTO_TRON_NATIVE_TOKEN_ADDRESS: \${CRYPTO_TRON_NATIVE_TOKEN_ADDRESS}
        CRYPTO_TRON_NATIVE_TOKEN_DECIMALS: \${CRYPTO_TRON_NATIVE_TOKEN_DECIMALS}
        CRYPTO_TRON_NATIVE_TOKEN_SYMBOL: \${CRYPTO_TRON_NATIVE_TOKEN_SYMBOL}
        CRYPTO_TRON_POOL_ADDRESS: \${CRYPTO_TRON_POOL_ADDRESS}
        CRYPTO_TRON_STABLE_TOKEN_ADDRESS: \${CRYPTO_TRON_STABLE_TOKEN_ADDRESS}
        CRYPTO_TRON_STABLE_TOKEN_DECIMALS: \${CRYPTO_TRON_STABLE_TOKEN_DECIMALS}
        CRYPTO_TRON_STABLE_TOKEN_SYMBOL: \${CRYPTO_TRON_STABLE_TOKEN_SYMBOL}
        DATABASE_URL: \${DATABASE_URL}
        FRONTEND_URL: \${FRONTEND_URL}
        HOST: \${HOST}
        MONGO_APP_DB_NAME: \${MONGO_APP_DB_NAME}
        MONGO_APP_PASSWORD: \${MONGO_APP_PASSWORD}
        MONGO_APP_USER: \${MONGO_APP_USER}
        MONGO_INITDB_ROOT_PASSWORD: \${MONGO_INITDB_ROOT_PASSWORD}
        MONGO_INITDB_ROOT_USERNAME: \${MONGO_INITDB_ROOT_USERNAME}
        NEXT_PUBLIC_FRONTEND_URL: \${NEXT_PUBLIC_FRONTEND_URL}
        NEXT_PUBLIC_SERVER_URL: \${NEXT_PUBLIC_SERVER_URL}
        PAYLOAD_DEBUG: \${PAYLOAD_DEBUG:-false}
        PAYLOAD_ENABLE_LIVE_PREVIEW: \${PAYLOAD_ENABLE_LIVE_PREVIEW:-false}
        PAYLOAD_LOG_LEVEL: \${PAYLOAD_LOG_LEVEL:-info}
        PAYLOAD_SECRET: \${PAYLOAD_SECRET}
        PORT: \${PORT}
        PREVIEW_SECRET: \${PREVIEW_SECRET}
        SMTP_FROM_ADDRESS: \${SMTP_FROM_ADDRESS}
        SMTP_FROM_NAME: \${SMTP_FROM_NAME}
        SMTP_HOST: \${SMTP_HOST}
        SMTP_PASS: \${SMTP_PASS}
        SMTP_PORT: \${SMTP_PORT}
        SMTP_USER: \${SMTP_USER}
        THIRDWEB_CLIENT_ID: \${THIRDWEB_CLIENT_ID}
        THIRDWEB_SECRET_KEY: \${THIRDWEB_SECRET_KEY}
        TRONWEB_API: \${TRONWEB_API}
        TRONWEB_SECRET: \${TRONWEB_SECRET}
    env_file:
      - ./runtime.env
    depends_on:
      mongo-init:
        condition: service_completed_successfully
    expose:
      - "3001"
    restart: unless-stopped

  caddy:
    image: caddy:2.8-alpine
    depends_on:
      - app
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped

volumes:
  mongo-data:
  caddy-data:
  caddy-config:
EOF

echo
echo "Generated deployment files under: $DEPLOY_DIR"
echo "Building and starting the stack..."

run_docker compose --env-file "$RUNTIME_ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
run_docker compose --env-file "$RUNTIME_ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo
echo "Deployment complete."
echo "Domain: https://$APP_DOMAIN"
echo "Admin: https://$APP_DOMAIN/admin"
echo "MongoDB database: $MONGO_DB_NAME"
echo "App user: $MONGO_APP_USER"
echo "Runtime env file: $RUNTIME_ENV_FILE"
