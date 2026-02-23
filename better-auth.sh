#!/bin/bash

echo "BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')" >> .env
pnpm pm2 restart liberstake-market --update-env
