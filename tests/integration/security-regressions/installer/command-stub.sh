#!/bin/bash
set -euo pipefail

command_name="${0##*/}"
printf '%q ' "$command_name" "$@" >> "$FIXTURE_DIR/commands.log"
printf '\n' >> "$FIXTURE_DIR/commands.log"

case "$command_name" in
  docker)
    if [[ " $* " == *" up "* ]]; then
      /bin/cp "$INSTALL_ROOT/.deploy/docker-compose.yml" "$FIXTURE_DIR/generated-compose.yml"
      /bin/cp "$INSTALL_ROOT/.deploy/runtime.env" "$FIXTURE_DIR/generated-runtime.env"
      /usr/bin/stat -c '%a' "$INSTALL_ROOT/.deploy/runtime.env" > "$FIXTURE_DIR/runtime-mode"
    fi
    ;;
  git)
    if [[ "$1" == "clone" ]]; then
      /bin/mkdir -p "${!#}/.git" "${!#}/public/media"
    elif [[ " $* " == *" branch --show-current "* ]]; then
      printf 'main\n'
    fi
    ;;
  curl)
    if [[ " $* " == *"https://api.ipify.org"* ]]; then
      printf '203.0.113.10'
    else
      previous=""
      for argument in "$@"; do
        if [[ "$previous" == "-o" ]]; then
          printf '{}' > "$argument"
        fi
        previous="$argument"
      done
      printf '200'
    fi
    ;;
  nginx|certbot|systemctl)
    ;;
  pnpm)
    exit 37
    ;;
  sleep)
    exit 37
    ;;
  *)
    printf 'Unexpected fixture command: %s\n' "$command_name" >&2
    exit 97
    ;;
esac
