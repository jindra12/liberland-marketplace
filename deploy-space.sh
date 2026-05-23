#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jindra12/liberland-marketplace.git}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/liberland-marketplace}"
BRANCH=""
SERVER_URL="${SERVER_URL:-https://backend.nswap.io}"
SILENT="${SILENT:-false}"
TEST_DATA="${TEST_DATA:-false}"
TEST_DATA_DIR="${TEST_DATA_DIR:-testdata}"
REUSE_ENV_FILE="${REUSE_ENV_FILE:-${REUSE_EXISTING_ENV:-}}"
BLOCK_NON_ADMIN_CONTENT_CREATION="${BLOCK_NON_ADMIN_CONTENT_CREATION:-}"
CLEAN_SOURCE_AFTER_DEPLOY="${CLEAN_SOURCE_AFTER_DEPLOY:-true}"
APP_PORT="${APP_PORT:-3001}"
MONGO_DB_NAME="liberland"
MONGO_APP_USER="liberland_app"
MONGO_ROOT_USER="rootAdmin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: deploy-space.sh [--branch <name>] [-b <name>]
                    [--server <url>]
                    [--no-permission-server]
                    [--permission-server]
                    [--test-data]
                    [--silent] [-s]
                    [--reuse-env <file>]

Standalone installer that:
- clones the app from the configured repository URL
- optionally checks out a specific branch
- installs Docker, Git, and HTTPS tooling if needed
- configures local MongoDB, the app, and HTTPS reverse proxying
- asks for a subdomain and publishes the app on a nip.io hostname
- optionally submits a draft syndication entry for the new deployment

Environment overrides:
- REPO_URL: git HTTPS URL to clone
- INSTALL_ROOT: target directory for the managed checkout
- SERVER_URL: source server URL for the installer route
- SYNDICATION_NAME: optional name used when creating the syndication draft
- SYNDICATION_DESCRIPTION: optional description used when creating the syndication draft
- BLOCK_NON_ADMIN_CONTENT_CREATION: set to true to make the server a no-permission server
- SILENT: set to true to skip the syndication draft submission
- TEST_DATA: set to true to seed the database from ./testdata
- TEST_DATA_DIR: fixture directory relative to the installer script, defaults to testdata
- REUSE_ENV_FILE: env file to reuse values from before prompting
- CLEAN_SOURCE_AFTER_DEPLOY: set to false to keep the cloned source checkout after deploy
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
    --server)
      if [[ $# -lt 2 ]]; then
        echo "Error: $1 requires a server URL." >&2
        exit 1
      fi
      SERVER_URL="$2"
      shift 2
      ;;
    --no-permission-server)
      BLOCK_NON_ADMIN_CONTENT_CREATION="true"
      shift
      ;;
    --permission-server)
      BLOCK_NON_ADMIN_CONTENT_CREATION="false"
      shift
      ;;
    -s|--silent)
      SILENT="true"
      shift
      ;;
    --test-data)
      TEST_DATA="true"
      shift
      ;;
    --reuse-env)
      if [[ $# -lt 2 ]]; then
        echo "Error: $1 requires a file path." >&2
        exit 1
      fi
      REUSE_ENV_FILE="$2"
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
MONGO_SEED_FILE="$DEPLOY_DIR/mongo-seed.js"
TESTDATA_DEPLOY_DIR="$DEPLOY_DIR/testdata"
NGINX_SITES_AVAILABLE_DIR="${NGINX_SITES_AVAILABLE_DIR:-/etc/nginx/sites-available}"
NGINX_SITES_ENABLED_DIR="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

DOCKER_COMPOSE_BIN="docker compose"

run_sudo() {
  "${SUDO[@]}" "$@"
}

run_docker() {
  "${SUDO[@]}" docker "$@"
}

run_compose() {
  if [[ "$DOCKER_COMPOSE_BIN" == "docker-compose" ]]; then
    "${SUDO[@]}" docker-compose "$@"
    return
  fi

  "${SUDO[@]}" docker compose "$@"
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

prompt_yes_no_or_env() {
  local __target="$1"
  local __env_name="$2"
  local __label="$3"
  local __default="${4:-false}"
  local __value="${!__env_name:-}"

  case "$__value" in
    true|1|yes|y|on)
      printf -v "$__target" '%s' 'true'
      return
      ;;
    false|0|no|n|off)
      printf -v "$__target" '%s' 'false'
      return
      ;;
  esac

  if [[ -n "$__value" ]]; then
    printf -v "$__target" '%s' "$__value"
    return
  fi

  if [[ "$__default" == "true" ]]; then
    read -r -p "$__label [Y/n]: " __value
    case "${__value:-}" in
      n|N|no|NO)
        __value="false"
        ;;
      *)
        __value="true"
        ;;
    esac
  else
    read -r -p "$__label [y/N]: " __value
    case "${__value:-}" in
      y|Y|yes|YES)
        __value="true"
        ;;
      *)
        __value="false"
        ;;
    esac
  fi

  printf -v "$__target" '%s' "$__value"
}

load_existing_env_file() {
  local env_file="$1"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  while IFS='=' read -r key value; do
    case "$key" in
      ''|\#*)
        continue
        ;;
    esac

    eval "export $key=$value"
  done < "$env_file"
}

derive_subdomain_from_domain() {
  local domain="$1"
  local public_ip="$2"
  local suffix=".${public_ip//./-}.nip.io"

  if [[ "$domain" == *"$suffix" ]]; then
    printf '%s' "${domain%"$suffix"}"
    return 0
  fi

  return 1
}

ensure_reuse_env_loaded() {
  if [[ -z "$REUSE_ENV_FILE" ]]; then
    return 0
  fi

  if [[ -f "$REUSE_ENV_FILE" ]]; then
    echo "Reusing existing environment from: $REUSE_ENV_FILE"
    load_existing_env_file "$REUSE_ENV_FILE"
    return 0
  fi

  echo "Reusing existing environment was requested, but '$REUSE_ENV_FILE' was not found." >&2
}

ensure_generated_env_loaded() {
  if [[ -f "$RUNTIME_ENV_FILE" ]]; then
    load_existing_env_file "$RUNTIME_ENV_FILE"
  fi
}

prepare_test_data() {
  if [[ "$TEST_DATA" != "true" ]]; then
    return 0
  fi

  local test_data_dir="${TEST_DATA_DIR:-testdata}"
  local testdata_source_dir="$SCRIPT_DIR/$test_data_dir"

  if [[ ! -d "$testdata_source_dir" ]]; then
    echo "Error: test data directory '$testdata_source_dir' was not found." >&2
    exit 1
  fi

  echo "Preparing test data fixtures from: $testdata_source_dir"
  rm -rf "$TESTDATA_DEPLOY_DIR"
  mkdir -p "$TESTDATA_DEPLOY_DIR"
  cp -R "$testdata_source_dir"/. "$TESTDATA_DEPLOY_DIR"/
  echo "Test data fixtures copied to: $TESTDATA_DEPLOY_DIR"
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
  if docker info >/dev/null 2>&1; then
    return
  fi

  run_sudo apt-get update
  run_sudo apt-get install -y ca-certificates curl gnupg openssl git

  echo "Installing Docker and supporting packages..."
  if ! apt-cache policy docker-compose-v2 2>/dev/null | grep -q '^  Candidate: (none)$'; then
    run_sudo apt-get install -y docker.io docker-compose-v2
    DOCKER_COMPOSE_BIN="docker compose"
  elif ! apt-cache policy docker-compose-plugin 2>/dev/null | grep -q '^  Candidate: (none)$'; then
    run_sudo apt-get install -y docker.io docker-compose-plugin
    DOCKER_COMPOSE_BIN="docker compose"
  else
    run_sudo apt-get install -y docker.io docker-compose
    DOCKER_COMPOSE_BIN="docker-compose"
  fi
  run_sudo systemctl enable --now docker

  if command -v ufw >/dev/null 2>&1; then
    run_sudo ufw allow 80/tcp >/dev/null 2>&1 || true
    run_sudo ufw allow 443/tcp >/dev/null 2>&1 || true
  fi
}

ensure_nginx_tools() {
  if command -v nginx >/dev/null 2>&1 && command -v certbot >/dev/null 2>&1; then
    return 0
  fi

  run_sudo apt-get update
  run_sudo apt-get install -y nginx certbot python3-certbot-nginx
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
  local subdomain="$2"
  local ip_suffix="${public_ip//./-}"
  printf '%s.%s.nip.io' "$subdomain" "$ip_suffix"
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
ensure_reuse_env_loaded
ensure_generated_env_loaded
prepare_test_data
DEFAULT_SUBDOMAIN="marketplace"
DEFAULT_DOMAIN="$(make_nip_domain "$PUBLIC_IP" "$DEFAULT_SUBDOMAIN")"

echo
echo "Using free wildcard DNS via nip.io:"
echo "  Public IP: $PUBLIC_IP"
echo "  Default nip.io domain: https://$DEFAULT_DOMAIN"
echo

if [[ -z "${APP_SUBDOMAIN:-}" && -n "${APP_DOMAIN:-}" ]]; then
  if derived_subdomain="$(derive_subdomain_from_domain "$APP_DOMAIN" "$PUBLIC_IP")"; then
    APP_SUBDOMAIN="$derived_subdomain"
  fi
fi

if [[ -n "$REUSE_ENV_FILE" ]]; then
  APP_SUBDOMAIN="${APP_SUBDOMAIN:-$DEFAULT_SUBDOMAIN}"
  if [[ "$SILENT" != "true" ]]; then
    SYNDICATION_NAME="${SYNDICATION_NAME:-Liberland Marketplace}"
    SYNDICATION_DESCRIPTION="${SYNDICATION_DESCRIPTION:-}"
  fi
else
  if [[ "$SILENT" != "true" ]]; then
    prompt_value_or_env SYNDICATION_NAME SYNDICATION_NAME "Syndication name" "Liberland Marketplace"
    prompt_value_or_env SYNDICATION_DESCRIPTION SYNDICATION_DESCRIPTION "Syndication description" ""
  fi
fi

if [[ -z "${BLOCK_NON_ADMIN_CONTENT_CREATION:-}" ]]; then
  prompt_yes_no_or_env \
    BLOCK_NON_ADMIN_CONTENT_CREATION \
    BLOCK_NON_ADMIN_CONTENT_CREATION \
    "Make this a no-permission server (block non-admin content creation)?" \
    false
fi

if [[ -z "${APP_SUBDOMAIN:-}" ]]; then
  prompt_value_or_env APP_SUBDOMAIN APP_SUBDOMAIN "Subdomain name" "$DEFAULT_SUBDOMAIN"
fi

SYNDICATION_NAME="${SYNDICATION_NAME:-}"
SYNDICATION_DESCRIPTION="${SYNDICATION_DESCRIPTION:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-liberland_${APP_SUBDOMAIN}}"

APP_DOMAIN="$(make_nip_domain "$PUBLIC_IP" "$APP_SUBDOMAIN")"

PAYLOAD_SECRET="${PAYLOAD_SECRET:-$(generate_secret)}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(generate_secret)}"
CRON_SECRET="${CRON_SECRET:-$(generate_secret)}"
PREVIEW_SECRET="${PREVIEW_SECRET:-$(generate_secret)}"

PAYLOAD_DEBUG="${PAYLOAD_DEBUG:-false}"
PAYLOAD_ENABLE_LIVE_PREVIEW="false"
PAYLOAD_LOG_LEVEL="info"

SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM_ADDRESS="${SMTP_FROM_ADDRESS:-noreply@${APP_DOMAIN}}"
SMTP_FROM_NAME="${SMTP_FROM_NAME:-Liberland Marketplace}"

GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-}"
OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-}"
OIDC_REDIRECT_URLS="${OIDC_REDIRECT_URLS:-https://${APP_DOMAIN}/auth/callback}"

THIRDWEB_SECRET_KEY="${THIRDWEB_SECRET_KEY:-}"
THIRDWEB_CLIENT_ID="${THIRDWEB_CLIENT_ID:-}"

TRONWEB_API="${TRONWEB_API:-https://api.trongrid.io}"
TRONWEB_SECRET="${TRONWEB_SECRET:-}"

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

MONGO_INITDB_ROOT_USERNAME="${MONGO_INITDB_ROOT_USERNAME:-rootAdmin}"
MONGO_INITDB_ROOT_PASSWORD="${MONGO_INITDB_ROOT_PASSWORD:-$(generate_secret)}"
MONGO_APP_USER="${MONGO_APP_USER:-liberland_app}"
MONGO_APP_PASSWORD="${MONGO_APP_PASSWORD:-$(generate_secret)}"
MONGO_KEYFILE="${MONGO_KEYFILE:-$(generate_secret)}"
MONGO_APP_DB_NAME="${MONGO_APP_DB_NAME:-liberland_${APP_SUBDOMAIN}}"

DATABASE_URL="mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@mongo:27017/${MONGO_APP_DB_NAME}?authSource=${MONGO_APP_DB_NAME}&replicaSet=rs0"
NEXT_PUBLIC_SERVER_URL="https://${APP_DOMAIN}"
NEXT_PUBLIC_FRONTEND_URL="$NEXT_PUBLIC_SERVER_URL"
FRONTEND_URL="$NEXT_PUBLIC_SERVER_URL"
HOST="0.0.0.0"
PORT="$APP_PORT"
CRON_HOST="127.0.0.1"

set_and_export APP_DOMAIN "$APP_DOMAIN"
set_and_export APP_SUBDOMAIN "$APP_SUBDOMAIN"
set_and_export APP_PORT "$APP_PORT"
set_and_export COMPOSE_PROJECT_NAME "$COMPOSE_PROJECT_NAME"
set_and_export SYNDICATION_NAME "$SYNDICATION_NAME"
set_and_export SYNDICATION_DESCRIPTION "$SYNDICATION_DESCRIPTION"
set_and_export PAYLOAD_SECRET "$PAYLOAD_SECRET"
set_and_export BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
set_and_export CRON_SECRET "$CRON_SECRET"
set_and_export PREVIEW_SECRET "$PREVIEW_SECRET"
set_and_export PAYLOAD_DEBUG "$PAYLOAD_DEBUG"
set_and_export PAYLOAD_ENABLE_LIVE_PREVIEW "$PAYLOAD_ENABLE_LIVE_PREVIEW"
set_and_export PAYLOAD_LOG_LEVEL "$PAYLOAD_LOG_LEVEL"
set_and_export BLOCK_NON_ADMIN_CONTENT_CREATION "$BLOCK_NON_ADMIN_CONTENT_CREATION"
set_and_export SMTP_HOST "$SMTP_HOST"
set_and_export SMTP_PORT "$SMTP_PORT"
set_and_export SMTP_USER "$SMTP_USER"
set_and_export SMTP_PASS "$SMTP_PASS"
set_and_export SMTP_FROM_ADDRESS "$SMTP_FROM_ADDRESS"
set_and_export SMTP_FROM_NAME "$SMTP_FROM_NAME"
set_and_export GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
set_and_export GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
set_and_export OIDC_CLIENT_ID "$OIDC_CLIENT_ID"
set_and_export OIDC_CLIENT_SECRET "$OIDC_CLIENT_SECRET"
set_and_export OIDC_REDIRECT_URLS "$OIDC_REDIRECT_URLS"
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
set_and_export MONGO_KEYFILE "$MONGO_KEYFILE"
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
APP_SUBDOMAIN=$(quote_env_value "$APP_SUBDOMAIN")
APP_PORT=$(quote_env_value "$APP_PORT")
COMPOSE_PROJECT_NAME=$(quote_env_value "$COMPOSE_PROJECT_NAME")
SYNDICATION_NAME=$(quote_env_value "$SYNDICATION_NAME")
SYNDICATION_DESCRIPTION=$(quote_env_value "$SYNDICATION_DESCRIPTION")
PAYLOAD_SECRET=$(quote_env_value "$PAYLOAD_SECRET")
BETTER_AUTH_SECRET=$(quote_env_value "$BETTER_AUTH_SECRET")
CRON_SECRET=$(quote_env_value "$CRON_SECRET")
PREVIEW_SECRET=$(quote_env_value "$PREVIEW_SECRET")
PAYLOAD_DEBUG=$(quote_env_value "$PAYLOAD_DEBUG")
PAYLOAD_ENABLE_LIVE_PREVIEW=$(quote_env_value "$PAYLOAD_ENABLE_LIVE_PREVIEW")
PAYLOAD_LOG_LEVEL=$(quote_env_value "$PAYLOAD_LOG_LEVEL")
BLOCK_NON_ADMIN_CONTENT_CREATION=$(quote_env_value "$BLOCK_NON_ADMIN_CONTENT_CREATION")
SMTP_HOST=$(quote_env_value "$SMTP_HOST")
SMTP_PORT=$(quote_env_value "$SMTP_PORT")
SMTP_USER=$(quote_env_value "$SMTP_USER")
SMTP_PASS=$(quote_env_value "$SMTP_PASS")
SMTP_FROM_ADDRESS=$(quote_env_value "$SMTP_FROM_ADDRESS")
SMTP_FROM_NAME=$(quote_env_value "$SMTP_FROM_NAME")
GOOGLE_CLIENT_ID=$(quote_env_value "$GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET=$(quote_env_value "$GOOGLE_CLIENT_SECRET")
OIDC_CLIENT_ID=$(quote_env_value "$OIDC_CLIENT_ID")
OIDC_CLIENT_SECRET=$(quote_env_value "$OIDC_CLIENT_SECRET")
OIDC_REDIRECT_URLS=$(quote_env_value "$OIDC_REDIRECT_URLS")
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
MONGO_KEYFILE=$(quote_env_value "$MONGO_KEYFILE")
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
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

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
ARG BLOCK_NON_ADMIN_CONTENT_CREATION
ARG PORT
ARG PREVIEW_SECRET
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG OIDC_CLIENT_ID
ARG OIDC_CLIENT_SECRET
ARG OIDC_REDIRECT_URLS
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
ENV BLOCK_NON_ADMIN_CONTENT_CREATION=$BLOCK_NON_ADMIN_CONTENT_CREATION
ENV PAYLOAD_LOG_LEVEL=$PAYLOAD_LOG_LEVEL
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
ENV PORT=$PORT
ENV PREVIEW_SECRET=$PREVIEW_SECRET
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV OIDC_CLIENT_ID=$OIDC_CLIENT_ID
ENV OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET
ENV OIDC_REDIRECT_URLS=$OIDC_REDIRECT_URLS
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

APP_DEPENDS_ON_BLOCK=$'      mongo-init:\n        condition: service_completed_successfully'
MONGO_SEED_SERVICE_BLOCK=""

if [[ "$TEST_DATA" == "true" ]]; then
  APP_DEPENDS_ON_BLOCK=$'      mongo-seed:\n        condition: service_completed_successfully'
  cat > "$MONGO_SEED_FILE" <<'EOF'
const fs = require('fs')
const path = require('path')

const dbName = process.env.MONGO_APP_DB_NAME
const dataDir = '/testdata'
const collections = fs
  .readdirSync(dataDir)
  .filter((file) => file.endsWith('.json'))
  .sort()

if (!dbName) {
  throw new Error('Missing MONGO_APP_DB_NAME.')
}

const appDb = db.getSiblingDB(dbName)
const parseFixture = (raw) => {
  if (typeof EJSON !== 'undefined' && typeof EJSON.parse === 'function') {
    return EJSON.parse(raw)
  }

  return JSON.parse(raw)
}

for (const fileName of collections) {
  const sourcePath = path.join(dataDir, fileName)
  const raw = fs.readFileSync(sourcePath, 'utf8').trim()

  if (!raw) {
    print(`Skipping empty fixture file: ${fileName}`)
    continue
  }

  const collectionName = fileName === 'searches.json' ? 'search' : path.basename(fileName, '.json')
  const documents = parseFixture(raw)

  if (!Array.isArray(documents)) {
    throw new Error(`Fixture file is not an array: ${fileName}`)
  }

  appDb.getCollection(collectionName).deleteMany({})

  if (documents.length === 0) {
    print(`Seeded ${collectionName}: 0 documents`)
    continue
  }

  const result = appDb.getCollection(collectionName).insertMany(documents, { ordered: false })
  print(`Seeded ${collectionName}: ${Object.keys(result.insertedIds).length} documents`)
}
EOF
  MONGO_SEED_SERVICE_BLOCK=$(cat <<EOF
  mongo-seed:
    image: mongo:8.0
    depends_on:
      mongo-init:
        condition: service_completed_successfully
    environment:
      MONGO_APP_DB_NAME: \${MONGO_APP_DB_NAME}
      MONGO_APP_USER: \${MONGO_APP_USER}
      MONGO_APP_PASSWORD: \${MONGO_APP_PASSWORD}
    volumes:
      - ./testdata:/testdata:ro
      - ./mongo-seed.js:/mongo-seed.js:ro
    command:
      - sh
      - -lc
      - |
        mongosh "mongodb://\${MONGO_APP_USER}:\${MONGO_APP_PASSWORD}@mongo:27017/\${MONGO_APP_DB_NAME}?authSource=\${MONGO_APP_DB_NAME}&replicaSet=rs0" --quiet /mongo-seed.js
    restart: "no"

EOF
)
fi

cat > "$COMPOSE_FILE" <<EOF
services:
  mongo-keyfile-init:
    image: mongo:8.0
    environment:
      MONGO_KEYFILE: \${MONGO_KEYFILE}
    volumes:
      - mongo-keyfile:/mongo-keyfile
    command:
      - sh
      - -lc
      - |
        umask 177
        printf '%s' "\$MONGO_KEYFILE" > /mongo-keyfile/mongo-keyfile
        chown 999:999 /mongo-keyfile/mongo-keyfile
    restart: "no"

  mongo:
    image: mongo:8.0
    depends_on:
      mongo-keyfile-init:
        condition: service_completed_successfully
    command:
      - mongod
      - --replSet
      - rs0
      - --bind_ip_all
      - --keyFile
      - /etc/mongo-keyfile/mongo-keyfile
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
      - mongo-keyfile:/etc/mongo-keyfile:ro
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

${MONGO_SEED_SERVICE_BLOCK}

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
        BLOCK_NON_ADMIN_CONTENT_CREATION: \${BLOCK_NON_ADMIN_CONTENT_CREATION:-false}
        PAYLOAD_LOG_LEVEL: \${PAYLOAD_LOG_LEVEL:-info}
        PAYLOAD_SECRET: \${PAYLOAD_SECRET}
        PORT: \${PORT}
        PREVIEW_SECRET: \${PREVIEW_SECRET}
        GOOGLE_CLIENT_ID: \${GOOGLE_CLIENT_ID}
        GOOGLE_CLIENT_SECRET: \${GOOGLE_CLIENT_SECRET}
        OIDC_CLIENT_ID: \${OIDC_CLIENT_ID}
        OIDC_CLIENT_SECRET: \${OIDC_CLIENT_SECRET}
        OIDC_REDIRECT_URLS: \${OIDC_REDIRECT_URLS}
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
${APP_DEPENDS_ON_BLOCK}
    expose:
      - "${APP_PORT}"
    ports:
      - "127.0.0.1:${APP_PORT}:${APP_PORT}"
    restart: unless-stopped

volumes:
  mongo-data:
  mongo-keyfile:
EOF

echo
echo "Generated deployment files under: $DEPLOY_DIR"
echo "Building and starting the stack..."

run_compose -p "$COMPOSE_PROJECT_NAME" --env-file "$RUNTIME_ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
run_compose -p "$COMPOSE_PROJECT_NAME" --env-file "$RUNTIME_ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo

ensure_nginx_tools

write_nginx_proxy() {
  local site_name="${APP_DOMAIN}.conf"
  local site_file="${NGINX_SITES_AVAILABLE_DIR}/${site_name}"
  local site_link="${NGINX_SITES_ENABLED_DIR}/${site_name}"
  local tmp_file
  local backup_file
  tmp_file="$(mktemp)"
  backup_file="${site_file}.$(date +%Y%m%d%H%M%S).bak"

  run_sudo mkdir -p "$NGINX_SITES_AVAILABLE_DIR" "$NGINX_SITES_ENABLED_DIR"

  cat > "$tmp_file" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $APP_DOMAIN;

  client_max_body_size 100m;

  location / {
    proxy_pass http://127.0.0.1:$APP_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF

  if run_sudo test -f "$site_file"; then
    echo "Existing Nginx config found. Creating backup: $backup_file"
    run_sudo cp "$site_file" "$backup_file"
  fi

  run_sudo mv "$tmp_file" "$site_file"
  run_sudo chown root:root "$site_file"
  run_sudo chmod 644 "$site_file"

  if ! run_sudo test -L "$site_link"; then
    run_sudo ln -s "$site_file" "$site_link"
  fi

  run_sudo nginx -t
  run_sudo systemctl reload nginx

  run_sudo certbot --nginx -d "$APP_DOMAIN" --agree-tos --non-interactive --redirect --register-unsafely-without-email

  run_sudo nginx -t
  run_sudo systemctl reload nginx
}

write_nginx_proxy

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

create_syndication_draft() {
  local graphql_endpoint="${SERVER_URL%/}/api/graphql"
  local escaped_name
  local escaped_description
  local escaped_url
  local mutation_payload
  local response=""

  escaped_name="$(json_escape "$SYNDICATION_NAME")"
  escaped_description="$(json_escape "$SYNDICATION_DESCRIPTION")"
  escaped_url="$(json_escape "https://${APP_DOMAIN}")"

  mutation_payload="$(printf '{"query":"%s","variables":{"data":{"name":"%s","url":"%s","description":"%s"},"draft":true}}' \
    "$(json_escape 'mutation CreateSyndication($data: mutationSyndicationInput!, $draft: Boolean!) { createSyndication(data: $data, draft: $draft) { id } }')" \
    "$escaped_name" \
    "$escaped_url" \
    "$escaped_description")"

  for attempt in {1..30}; do
    echo "Syndication draft payload: $mutation_payload"
    if response="$(curl -fsS -X POST "$graphql_endpoint" -H 'content-type: application/json' --data-raw "$mutation_payload" 2>/dev/null)"; then
      if [[ "$response" == *'"errors"'* ]]; then
        echo "Error: failed to create syndication draft on ${SERVER_URL%/}." >&2
        echo "$response" >&2
        exit 1
      fi

      echo "Syndication draft submitted to: $graphql_endpoint"
      echo "Syndication draft response: $response"
      return
    fi

    sleep 2
  done

  echo "Error: unable to reach $graphql_endpoint to create the syndication draft." >&2
  exit 1
}

cleanup_source_checkout() {
  if [[ "$CLEAN_SOURCE_AFTER_DEPLOY" != "true" ]]; then
    echo "Keeping source checkout because CLEAN_SOURCE_AFTER_DEPLOY is not true."
    return 0
  fi

  if [[ -d "$SOURCE_DIR" ]]; then
    echo "Removing source checkout: $SOURCE_DIR"
    rm -rf "$SOURCE_DIR"
  fi
}

if [[ "$SILENT" == "true" ]]; then
  echo "Skipping syndication draft submission because --silent was supplied."
else
  create_syndication_draft
fi

cleanup_source_checkout

echo
echo "Deployment complete."
echo "Subdomain: $APP_SUBDOMAIN"
echo "Compose project: $COMPOSE_PROJECT_NAME"
echo "Domain: https://$APP_DOMAIN"
echo "App port: $APP_PORT"
echo "Admin: https://$APP_DOMAIN/admin"
echo "Installer: https://$APP_DOMAIN/deploy-space"
echo "Installer source: ${SERVER_URL%/}/deploy-space"
echo "MongoDB database: $MONGO_APP_DB_NAME"
echo "App user: $MONGO_APP_USER"
echo "Runtime env file: $RUNTIME_ENV_FILE"
