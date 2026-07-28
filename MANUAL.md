# Deployment Manual

`deploy-space.sh` is the fastest way to turn a clean server into a live Liberland Marketplace node.

Run it once and you get:

- a live marketplace you can open in your browser
- a secure admin area for setting up the site
- a server that is ready to keep running without extra manual setup

The installer keeps the setup deliberately simple. You choose a subdomain, and it handles the rest.

## Recommended Server

We recommend using a Contabo VPS for this.

- Contabo pricing: https://contabo.com/en-us/pricing/
- Contabo VPS page: https://contabo.com/en-us/vps-server/
- Ubuntu 24.04 LTS

## How To Get The Script Onto Contabo

Once you have shell access to the Contabo server, download the installer directly from the public route:

```bash
curl -fsSL https://backend.nswap.io/deploy-space -o deploy-space.sh
chmod +x deploy-space.sh
./deploy-space.sh
```

The public route is served by the app itself at:

- `/deploy-space`

If you already know the exact app URL, you can use that URL directly in the command above.
If you are using a different installer host, pass it to the script with `--server`:

```bash
./deploy-space.sh --server https://mirror.example.com
```

## What The Installer Does

The script sets up the app for you, creates the pieces it needs, and brings it online with HTTPS. When it finishes, it prints the admin link so you can open the new site right away.

The installer uses `nip.io`, so you only choose a subdomain name. If you pick `marketplace`, the app will open at a matching address under `backend.nswap.io`.

## What You Need To Set

During install, the script will ask you for the name you want to give the server.

Pick a short name you want people to use, and the app will be published under `backend.nswap.io` with that name.

Everything else is handled for you.

If you want to use extra app features, set those values before running the installer:

- Google login for OAuth sign-in
- OIDC login for another identity provider
- SMTP for email delivery

## Payments And Wallets

The app supports crypto payments. Users can pay with Ethereum, Solana, or Tron wallets depending on the configured payment flow.

The contents will soon appear on `nswap.io`, where people can buy and sell products, feature their own company, connect with like-minded people, and promote their business ventures.

## Running The Installer

Basic usage:

```bash
bash deploy-space.sh
```

Branch-specific deployment:

```bash
bash deploy-space.sh --branch feature-name
```

Installer host override:

```bash
bash deploy-space.sh --server https://mirror.example.com
```

## After The Install

When the script finishes, it prints the public domain, the admin URL, and the installer URL.

Open the admin URL in your browser and finish the app setup there.
