# Marketplace Sitemap Snapshots

`GET /api/sitemaps` exposes a cached manifest. `GET /api/sitemaps/<file>.xml`
serves an immutable, content-addressed XML shard. These anonymous endpoints never
return private account, order, cart, report, or subscriber data.

## Request-Driven Refresh

- Successful snapshots are fresh for **24 hours**.
- Fresh requests read files only; they do not initialize Payload or query MongoDB.
- A stale request returns the existing snapshot immediately and schedules refresh
  through Next's `after()`. There is **no cron job**, timer, or startup task.
- On an empty cache, the request returns `503` with `Retry-After: 60` while the first
  snapshot is generated after the response. Retry the same URL shortly afterward.
- A cross-process filesystem lock permits only one generator. Atomic writes
  publish the new manifest only after every collection succeeds. Failed refreshes
  retain the previous snapshot and back off for one hour before another attempt.
- Old, unreferenced shards remain for **14 days** after their last use; files in
  the active snapshot are never removed by retention cleanup.

## Storage and Deployment

Default directory: `~/.cache/nswap/sitemaps/<configuration-hash>/`, outside the
source checkout and `.next`. The hash scopes files to the database and configured
URLs. Ordinary app restarts, builds and checkout replacements do not erase them.
An optional `SITEMAP_CACHE_DIR` points to another persistent directory or a mounted
volume. The app's OS user needs read/write access. Ephemeral serverless disk is
not durable storage; host this backend on persistent disk or mount a volume.

The existing `NEXT_PUBLIC_SERVER_URL` and `NEXT_PUBLIC_FRONTEND_URL` settings
provide URL bases. No domains or production credentials are embedded in code.
The nswap gateway can rebase cached XML onto its own frontend URL without another
database scan; backend identity remains encoded in each canonical detail URL.

## Coverage and Scaling

Identities/tribes, public companies, products/services, jobs, ventures (`startups`),
posts, comments and published syndications. Reads use an anonymous Payload request,
`overrideAccess: false`, `draft: false`, explicit publication filters where that
collection has drafts, and `isPrivate: false` for companies.

Each shard contains at most 500 records. Keyset pagination selects only IDs and
record `updatedAt`, and streams XML through the `sitemap` package. No full records,
descriptions or media are cached. Source timestamps supply URL `lastmod`; content
hashes keep unchanged shards and their modification dates stable. Safety limits
cap generation time, shard count and bytes. Exceeding a limit fails the refresh
instead of publishing a silently truncated snapshot.

The public manifest also caches the published syndication directory. The frontend
traverses those manifests with its existing bounded, cycle-safe discovery logic
and emits one sitemap index pointing directly to proxied URL-set shards, not to
nested sitemap indexes. Deploy this backend feature before deploying its frontend
gateway. The first request warms each backend independently; it may take more than
one crawl to discover newly warmed servers.

Changes are intentionally eventually consistent: publications, deletions and
syndication updates appear on the next successful request-triggered refresh after
24 hours. Original detail endpoints still enforce their normal access controls.

## Verification

`pnpm exec vitest run tests/unit/sitemap-cache.spec.ts tests/unit/sitemap-http.spec.ts`

Tests use temporary filesystem directories, not the production database or cache.
