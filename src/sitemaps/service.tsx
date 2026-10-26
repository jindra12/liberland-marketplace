import path from 'node:path'
import lockfile from 'proper-lockfile'
import writeFileAtomic from 'write-file-atomic'

import {
  SITEMAP_COLLECTIONS,
  SITEMAP_MAX_BUILD_MS,
  SITEMAP_MAX_SHARDS,
  SITEMAP_PAGE_SIZE,
  SITEMAP_RETRY_MS,
  SITEMAP_TTL_MS,
} from './constants'
import type { SitemapCollection, SitemapManifest, SitemapShard, SitemapSource } from './types'
import {
  ensureSitemapDirectory,
  getSitemapCacheDirectory,
  getSitemapOrigins,
  readSitemapManifest,
  readSitemapRetryAt,
  removeExpiredSitemapShards,
  writeSitemapShard,
} from './utils'

const buildCollectionShards = async (
  source: SitemapSource,
  collection: SitemapCollection,
  directory: string,
  startedAt: number,
  remaining: number,
  after?: string | number,
): Promise<SitemapShard[]> => {
  if (remaining <= 0 || Date.now() - startedAt > SITEMAP_MAX_BUILD_MS) {
    throw new Error(
      'Sitemap generation exceeded its safety limits; retaining the previous snapshot.',
    )
  }
  const records = await source.readRecords(collection, after)
  if (!records.length) {
    return []
  }
  const shard = await writeSitemapShard(directory, collection, records)
  if (records.length < SITEMAP_PAGE_SIZE) {
    return [shard]
  }
  const next = records[records.length - 1].id
  if (next === after) {
    throw new Error('Sitemap cursor did not advance; retaining the previous snapshot.')
  }
  return [
    shard,
    ...(await buildCollectionShards(source, collection, directory, startedAt, remaining - 1, next)),
  ]
}

export const refreshSitemaps = async (
  createSource: () => Promise<SitemapSource>,
  directory = getSitemapCacheDirectory(),
) => {
  await ensureSitemapDirectory(directory)
  try {
    const release = await lockfile.lock(directory, { stale: 600000, retries: 0 })
    try {
      const current = await readSitemapManifest(directory)
      if (current && Date.now() - Date.parse(current.generatedAt) < SITEMAP_TTL_MS) {
        return { status: 'fresh', manifest: current }
      }
      if (Date.now() < (await readSitemapRetryAt(directory))) {
        return { status: 'deferred', manifest: current }
      }
      await writeFileAtomic(
        path.join(directory, 'retry-at.json'),
        JSON.stringify(Date.now() + SITEMAP_RETRY_MS),
      )
      const source = await createSource()
      const startedAt = Date.now()
      const shards = await SITEMAP_COLLECTIONS.reduce<Promise<SitemapShard[]>>(
        async (pending, collection) => {
          const previous = await pending
          return [
            ...previous,
            ...(await buildCollectionShards(
              source,
              collection,
              directory,
              startedAt,
              SITEMAP_MAX_SHARDS - previous.length,
            )),
          ]
        },
        Promise.resolve([]),
      )
      const manifest: SitemapManifest = {
        version: 1,
        ...getSitemapOrigins(),
        generatedAt: new Date().toISOString(),
        syndicatedServers: [...new Set(await source.readSyndicatedServers())],
        shards,
      }
      await writeFileAtomic(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
      await removeExpiredSitemapShards(directory, manifest)
      console.info('[sitemaps] Snapshot refreshed', {
        shards: shards.length,
        urls: shards.reduce((total, shard) => total + shard.count, 0),
      })
      return { status: 'refreshed', manifest }
    } finally {
      await release()
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ELOCKED') {
      return { status: 'busy', manifest: await readSitemapManifest(directory) }
    }
    console.error('[sitemaps] Refresh failed; previous files retained', error)
    throw error
  }
}
