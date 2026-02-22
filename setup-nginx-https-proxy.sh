#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/setup-nginx-https-proxy.sh

Interactive script to:
1) Ask for a domain (example: liberland-marketplace.ddnsfree.com)
2) Ask for app port (manual, default: 3000)
3) Create/update an isolated Nginx site config for that domain
4) Request and install Let's Encrypt HTTPS cert via Certbot

Notes:
- This script only edits one domain-specific file in:
  /etc/nginx/sites-available/<domain>.conf
- It does not remove or modify other existing domain configs.
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
}

is_valid_domain() {
  local domain="$1"
  [[ "$domain" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]
}

is_valid_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  (( port >= 1 && port <= 65535 ))
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd sudo
require_cmd nginx
require_cmd certbot

DOMAIN=""
while true; do
  read -r -p "Enter domain (example: liberland-marketplace.ddnsfree.com): " DOMAIN
  DOMAIN="${DOMAIN,,}"
  if is_valid_domain "$DOMAIN"; then
    break
  fi
  echo "Invalid domain format. Try again."
done

APP_PORT="3000"
while true; do
  read -r -p "Enter app port [3000]: " INPUT_PORT
  INPUT_PORT="${INPUT_PORT:-3000}"
  if is_valid_port "$INPUT_PORT"; then
    APP_PORT="$INPUT_PORT"
    break
  fi
  echo "Invalid port. Enter a number between 1 and 65535."
done

CERT_EMAIL=""
read -r -p "Enter email for Let's Encrypt notices (leave blank to skip): " CERT_EMAIL

SITE_NAME="${DOMAIN}.conf"
SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_FILE="${SITE_FILE}.bak.${TIMESTAMP}"
TMP_FILE="$(mktemp)"

cat >"$TMP_FILE" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  client_max_body_size 100m;

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
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

echo
echo "Writing Nginx site config for ${DOMAIN} -> 127.0.0.1:${APP_PORT}"
if sudo test -f "$SITE_FILE"; then
  echo "Existing config found. Creating backup: $BACKUP_FILE"
  sudo cp "$SITE_FILE" "$BACKUP_FILE"
fi

sudo mv "$TMP_FILE" "$SITE_FILE"
sudo chown root:root "$SITE_FILE"
sudo chmod 644 "$SITE_FILE"

if ! sudo test -L "$SITE_LINK"; then
  sudo ln -s "$SITE_FILE" "$SITE_LINK"
fi

echo "Testing Nginx configuration..."
sudo nginx -t
sudo systemctl reload nginx

echo "Requesting HTTPS certificate for ${DOMAIN}..."
CERTBOT_ARGS=(--nginx -d "$DOMAIN" --agree-tos --non-interactive --redirect)
if [[ -n "$CERT_EMAIL" ]]; then
  CERTBOT_ARGS+=(-m "$CERT_EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

sudo certbot "${CERTBOT_ARGS[@]}"

echo "Re-testing Nginx after Certbot changes..."
sudo nginx -t
sudo systemctl reload nginx

echo
echo "Done."
echo "Your site should now be available at: https://${DOMAIN}"
echo "Proxy target is: http://127.0.0.1:${APP_PORT}"
