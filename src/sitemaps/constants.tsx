export const SITEMAP_COLLECTION_PATHS = {
  identities: '/tribes',
  companies: '/companies',
  products: '/products-services',
  jobs: '/jobs',
  startups: '/ventures',
  posts: '/posts',
  comments: '/comments',
  syndications: '/syndication',
} as const
export const SITEMAP_COLLECTIONS = Object.keys(SITEMAP_COLLECTION_PATHS) as Array<
  keyof typeof SITEMAP_COLLECTION_PATHS
>
export const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000
export const SITEMAP_RETRY_MS = 60 * 60 * 1000
export const SITEMAP_RETENTION_MS = 14 * SITEMAP_TTL_MS
export const SITEMAP_PAGE_SIZE = 500
export const SITEMAP_MAX_SHARDS = 10000
export const SITEMAP_MAX_BUILD_MS = 240000
export const SITEMAP_MAX_SHARD_BYTES = 1500000
export const SITEMAP_FILE_PATTERN =
  /^(identities|companies|products|jobs|startups|posts|comments|syndications)-[a-f0-9]{64}\.xml$/
