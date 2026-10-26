import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, utimes } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import writeFileAtomic from 'write-file-atomic'
import { SitemapStream, streamToPromise } from 'sitemap'
import { z } from 'zod'

import {
  SITEMAP_FILE_PATTERN,
  SITEMAP_MAX_SHARDS,
  SITEMAP_MAX_SHARD_BYTES,
  SITEMAP_RETENTION_MS,
  SITEMAP_COLLECTION_PATHS,
} from './constants'
import type { SitemapCollection, SitemapManifest, SitemapRecord, SitemapShard } from './types'

export const sitemapManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  serverUrl: z.url(),
  frontendUrl: z.url(),
  syndicatedServers: z.array(z.url()).max(1000),
  shards: z
    .array(
      z.object({
        file: z.string().regex(SITEMAP_FILE_PATTERN),
        lastmod: z.iso.datetime(),
        count: z.number().int().nonnegative(),
      }),
    )
    .max(SITEMAP_MAX_SHARDS),
}) satisfies z.ZodType<SitemapManifest>

export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

export const getSitemapOrigins = () => {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL
  if (!serverUrl || !frontendUrl) {
    throw new Error(
      'NEXT_PUBLIC_SERVER_URL and NEXT_PUBLIC_FRONTEND_URL are required for marketplace sitemaps.',
    )
  }
  const urls = [serverUrl, frontendUrl].map((value) => {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Sitemap base URLs must be HTTP(S) without credentials, queries, or fragments.',
      )
    }
    return url.href.replace(/\/$/, '')
  })
  return { serverUrl: urls[0], frontendUrl: urls[1] }
}

export const getSitemapCacheDirectory = (): string => {
  const key = createHash('sha256')
    .update(JSON.stringify([getSitemapOrigins(), process.env.DATABASE_URL]))
    .digest('hex')
  return path.join(
    process.env.SITEMAP_CACHE_DIR || path.join(homedir(), '.cache', 'nswap', 'sitemaps'),
    key,
  )
}

export const readSitemapManifest = async (directory: string): Promise<SitemapManifest | null> => {
  try {
    return sitemapManifestSchema.parse(
      JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')),
    )
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      console.error('[sitemaps] Invalid manifest; a new snapshot will be generated', error)
      return null
    }
    throw error
  }
}

export const readSitemapRetryAt = async (directory: string): Promise<number> => {
  try {
    return z
      .number()
      .finite()
      .parse(JSON.parse(await readFile(path.join(directory, 'retry-at.json'), 'utf8')))
  } catch (error) {
    if (isMissingFile(error)) {
      return 0
    }
    throw error
  }
}

export const writeSitemapShard = async (
  directory: string,
  collection: SitemapCollection,
  records: SitemapRecord[],
): Promise<SitemapShard> => {
  const origins = getSitemapOrigins()
  const encodedServer = Buffer.from(origins.serverUrl, 'utf8').toString('hex')
  const entries = records.map((record) => ({
    url: `${origins.frontendUrl}${SITEMAP_COLLECTION_PATHS[collection]}/${encodeURIComponent(record.id)}/${encodedServer}`,
    lastmod: record.updatedAt,
  }))
  const xml = await streamToPromise(Readable.from(entries).pipe(new SitemapStream()))
  if (xml.length > SITEMAP_MAX_SHARD_BYTES) {
    throw new Error('Sitemap shard exceeded its byte limit; retaining the previous snapshot.')
  }
  const file = `${collection}-${createHash('sha256').update(xml).digest('hex')}.xml`
  const filename = path.join(directory, file)
  try {
    await stat(filename)
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error
    }
    await writeFileAtomic(filename, xml)
  }
  const metadata = await stat(filename)
  // Access time tracks retention without falsifying the XML modification date.
  await utimes(filename, new Date(), metadata.mtime)
  return { file, count: records.length, lastmod: metadata.mtime.toISOString() }
}

export const removeExpiredSitemapShards = async (
  directory: string,
  manifest: SitemapManifest,
): Promise<void> => {
  const currentFiles = new Set(manifest.shards.map((shard) => shard.file))
  const files = await readdir(directory)
  await Promise.all(
    files
      .filter((file) => SITEMAP_FILE_PATTERN.test(file) && !currentFiles.has(file))
      .map(async (file) => {
        const filename = path.join(directory, file)
        if (Date.now() - (await stat(filename)).atimeMs > SITEMAP_RETENTION_MS) {
          await unlink(filename)
        }
      }),
  )
}

export const ensureSitemapDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true })
}
