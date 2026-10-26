import type { SITEMAP_COLLECTION_PATHS } from './constants'

export type SitemapCollection = keyof typeof SITEMAP_COLLECTION_PATHS
export type SitemapRecord = { id: string | number; updatedAt?: string }
export type SitemapShard = { file: string; lastmod: string; count: number }
export type SitemapManifest = {
  version: 1
  generatedAt: string
  serverUrl: string
  frontendUrl: string
  syndicatedServers: string[]
  shards: SitemapShard[]
}
export type SitemapSource = {
  readRecords: (collection: SitemapCollection, after?: string | number) => Promise<SitemapRecord[]>
  readSyndicatedServers: () => Promise<string[]>
}
