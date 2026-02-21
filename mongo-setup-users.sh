#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/setup-mongo-users.sh [options]

Creates or updates:
1) Mongo admin user (role: root on admin DB)
2) Mongo app user (role: readWrite on app DB)
3) App DB initialization marker document

Options:
  --admin-user <name>   Admin username (default: rootAdmin)
  --app-user <name>     App username (default: liberland_app)
  --db-name <name>      App database name (default: liberland)
  --mongosh <path>      mongosh binary (default: mongosh)
  -h, --help            Show this help

Environment variable defaults are also supported:
  ADMIN_USER, APP_USER, DB_NAME, MONGOSH_BIN
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found in PATH." >&2
    exit 1
  fi
}

prompt_password() {
  local label="$1"
  local out_var="$2"
  local first=""
  local second=""

  while true; do
    read -r -s -p "$label: " first
    echo
    read -r -s -p "Confirm $label: " second
    echo

    if [[ -z "$first" ]]; then
      echo "Password cannot be empty. Try again." >&2
      continue
    fi

    if [[ "$first" != "$second" ]]; then
      echo "Passwords do not match. Try again." >&2
      continue
    fi

    printf -v "$out_var" '%s' "$first"
    break
  done
}

urlencode() {
  local raw="${1:-}"
  local encoded=""
  local i c hex

  for ((i = 0; i < ${#raw}; i++)); do
    c="${raw:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) encoded+="$c" ;;
      *)
        printf -v hex '%%%02X' "'$c"
        encoded+="$hex"
        ;;
    esac
  done

  printf '%s' "$encoded"
}

ADMIN_USER="${ADMIN_USER:-rootAdmin}"
APP_USER="${APP_USER:-liberland_app}"
DB_NAME="${DB_NAME:-liberland}"
MONGOSH_BIN="${MONGOSH_BIN:-mongosh}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-user)
      ADMIN_USER="${2:-}"
      shift 2
      ;;
    --app-user)
      APP_USER="${2:-}"
      shift 2
      ;;
    --db-name)
      DB_NAME="${2:-}"
      shift 2
      ;;
    --mongosh)
      MONGOSH_BIN="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$ADMIN_USER" || -z "$APP_USER" || -z "$DB_NAME" ]]; then
  echo "Error: admin user, app user, and db name must all be non-empty." >&2
  exit 1
fi

require_cmd "$MONGOSH_BIN"

echo "Mongo setup values:"
echo "  admin user: $ADMIN_USER"
echo "  app user:   $APP_USER"
echo "  db name:    $DB_NAME"
echo

ADMIN_PASS=""
APP_PASS=""
prompt_password "Mongo admin password" ADMIN_PASS
prompt_password "Mongo app password" APP_PASS

export ADMIN_USER APP_USER DB_NAME ADMIN_PASS APP_PASS

MONGO_SETUP_JS='
const adminUser = process.env.ADMIN_USER;
const appUser = process.env.APP_USER;
const dbName = process.env.DB_NAME;
const adminPass = process.env.ADMIN_PASS;
const appPass = process.env.APP_PASS;

if (!adminUser || !appUser || !dbName || !adminPass || !appPass) {
  throw new Error("Missing required setup values.");
}

function ensureUser(database, username, password, roles) {
  const existing = database.getUser(username);
  if (existing) {
    database.updateUser(username, { pwd: password, roles });
    print(`Updated user: ${username}`);
  } else {
    database.createUser({ user: username, pwd: password, roles });
    print(`Created user: ${username}`);
  }
}

const adminDb = db.getSiblingDB("admin");
const appDb = db.getSiblingDB(dbName);

ensureUser(adminDb, adminUser, adminPass, [{ role: "root", db: "admin" }]);
ensureUser(appDb, appUser, appPass, [{ role: "readWrite", db: dbName }]);

appDb.getCollection("_init").updateOne(
  { _id: "db-initialized" },
  { $setOnInsert: { createdAt: new Date() } },
  { upsert: true }
);

print(`Initialized DB marker in: ${dbName}`);
'

run_without_auth() {
  "$MONGOSH_BIN" --quiet --eval "$MONGO_SETUP_JS"
}

run_with_auth() {
  "$MONGOSH_BIN" \
    --quiet \
    -u "$ADMIN_USER" \
    -p "$ADMIN_PASS" \
    --authenticationDatabase admin \
    --eval "$MONGO_SETUP_JS"
}

echo "Attempting setup without explicit auth..."
if run_without_auth; then
  echo "Setup completed without explicit auth."
else
  echo
  echo "Unauthenticated setup failed. Retrying using admin authentication..."
  if run_with_auth; then
    echo "Setup completed using admin authentication."
  else
    echo "Error: setup failed with and without explicit auth." >&2
    echo "Tip: ensure mongod is running and you can connect from localhost." >&2
    exit 1
  fi
fi

ENCODED_APP_PASS="$(urlencode "$APP_PASS")"
echo
echo "Connection string (localhost):"
echo "mongodb://${APP_USER}:${ENCODED_APP_PASS}@127.0.0.1:27017/${DB_NAME}?authSource=${DB_NAME}"
