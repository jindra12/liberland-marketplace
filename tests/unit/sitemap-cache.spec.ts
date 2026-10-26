// @vitest-environment node
import { EventEmitter, once } from 'node:events'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSitemaps } from '@/sitemaps/service'
import {
  getSitemapCacheDirectory,
  readSitemapManifest,
  removeExpiredSitemapShards,
} from '@/sitemaps/utils'
import {
  SITEMAP_COLLECTIONS,
  SITEMAP_PAGE_SIZE,
  SITEMAP_TTL_MS,
  SITEMAP_RETENTION_MS,
} from '@/sitemaps/constants'
import type { SitemapSource } from '@/sitemaps/types'
import { publicSitemapWhere } from '@/sitemaps/payload'

describe('persistent request-driven sitemap cache', () => {
  const directories: string[] = []
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://market.example')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    )
  })
  const newDirectory = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'nswap-sitemaps-'))
    directories.push(directory)
    return directory
  }
  const createSource = (): SitemapSource => ({
    readRecords: vi.fn(async () => [{ id: 'record-id', updatedAt: '2026-01-02T03:04:05.000Z' }]),
    readSyndicatedServers: vi.fn(async () => ['https://other.example', 'https://other.example']),
  })
  const ageSnapshot = async (directory: string) => {
    const manifest = await readSitemapManifest(directory)
    if (!manifest) {
      throw new Error('Expected an existing test snapshot')
    }
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        ...manifest,
        generatedAt: new Date(Date.now() - SITEMAP_TTL_MS - 1000).toISOString(),
      }),
    )
    await writeFile(path.join(directory, 'retry-at.json'), '0')
    return readSitemapManifest(directory)
  }

  it('writes every supported collection and real record modification dates to immutable XML files', async () => {
    const directory = await newDirectory()
    const source = createSource()
    const result = await refreshSitemaps(async () => source, directory)
    expect(result.status).toBe('refreshed')
    expect(result.manifest?.shards).toHaveLength(SITEMAP_COLLECTIONS.length)
    expect(result.manifest?.syndicatedServers).toEqual(['https://other.example'])
    const file = result.manifest!.shards.find((shard) => shard.file.startsWith('companies-'))!
    const xml = await readFile(path.join(directory, file.file), 'utf8')
    expect(xml).toContain('/companies/record-id/68747470733a2f2f6261636b656e642e6578616d706c65')
    expect(xml).toContain('2026-01-02T03:04:05.000Z')
  })

  it('reuses disk snapshots for 24 hours without opening a database, including after module reload', async () => {
    const directory = await newDirectory()
    await refreshSitemaps(async () => createSource(), directory)
    const factory = vi.fn(async () => createSource())
    vi.resetModules()
    const reloaded = await import('@/sitemaps/service')
    expect((await reloaded.refreshSitemaps(factory, directory)).status).toBe('fresh')
    expect(factory).not.toHaveBeenCalled()
  })

  it('refreshes stale snapshots and keeps unchanged shard names and lastmod dates', async () => {
    const directory = await newDirectory()
    const first = await refreshSitemaps(async () => createSource(), directory)
    await ageSnapshot(directory)
    const second = await refreshSitemaps(async () => createSource(), directory)
    expect(second.status).toBe('refreshed')
    expect(second.manifest?.shards).toEqual(first.manifest?.shards)
  })

  it('retains the complete previous snapshot on a database failure and backs off for an hour', async () => {
    const directory = await newDirectory()
    await refreshSitemaps(async () => createSource(), directory)
    const previous = await ageSnapshot(directory)
    const failed = vi.fn(async (): Promise<SitemapSource> => {
      throw new Error('Database offline')
    })
    await expect(refreshSitemaps(failed, directory)).rejects.toThrow('Database offline')
    expect(await readSitemapManifest(directory)).toEqual(previous)
    expect((await refreshSitemaps(failed, directory)).status).toBe('deferred')
    expect(failed).toHaveBeenCalledTimes(1)
  })

  it('allows only one builder across concurrent requests', async () => {
    const directory = await newDirectory()
    const events = new EventEmitter()
    const ready = once(events, 'ready')
    const factory = vi.fn(async () => {
      const released = once(events, 'release')
      events.emit('ready')
      await released
      return createSource()
    })
    const first = refreshSitemaps(factory, directory)
    await ready
    try {
      const second = await refreshSitemaps(factory, directory)
      expect(second.status).toBe('busy')
      expect(factory).toHaveBeenCalledTimes(1)
    } finally {
      events.emit('release')
      await first
    }
  })

  it('paginates using the last identifier instead of scanning everything into memory', async () => {
    const directory = await newDirectory()
    const source = createSource()
    const readRecords = vi.fn(async (collection: string, after?: string | number) => {
      if (collection !== 'companies') {
        return []
      }
      return after
        ? [{ id: 'last-record' }]
        : Array.from({ length: SITEMAP_PAGE_SIZE }, (_, id) => ({
            id: String(id).padStart(6, '0'),
          }))
    })
    const result = await refreshSitemaps(async () => ({ ...source, readRecords }), directory)
    expect(result.manifest?.shards.map((shard) => shard.count)).toEqual([SITEMAP_PAGE_SIZE, 1])
    expect(readRecords).toHaveBeenCalledWith('companies', '000499')
  })

  it('removes only unreferenced shards older than 14 days', async () => {
    const directory = await newDirectory()
    const result = await refreshSitemaps(async () => createSource(), directory)
    const [old, active] = result.manifest!.shards
    const past = new Date(Date.now() - SITEMAP_RETENTION_MS - 10000)
    await utimes(path.join(directory, old.file), past, past)
    await utimes(path.join(directory, active.file), past, past)
    await removeExpiredSitemapShards(directory, { ...result.manifest!, shards: [active] })
    await expect(stat(path.join(directory, old.file))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await stat(path.join(directory, active.file))).toBeDefined()
  })

  it('scopes cache directories by backend/database and filters drafts and private companies', () => {
    vi.stubEnv('DATABASE_URL', 'mongodb://test-one')
    const one = getSitemapCacheDirectory()
    vi.stubEnv('DATABASE_URL', 'mongodb://test-two')
    expect(getSitemapCacheDirectory()).not.toBe(one)
    expect(publicSitemapWhere('companies', 'cursor')).toEqual({
      and: [
        { _status: { equals: 'published' } },
        { isPrivate: { equals: false } },
        { id: { greater_than: 'cursor' } },
      ],
    })
    expect(publicSitemapWhere('identities')).toEqual({ and: [] })
    expect(publicSitemapWhere('jobs')).toEqual({ and: [{ _status: { equals: 'published' } }] })
  })
})
