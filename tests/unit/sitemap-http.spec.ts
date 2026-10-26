// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const scheduled = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  refresh: vi.fn(async () => ({ status: 'fresh' })),
}))
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => scheduled.callbacks.push(callback),
}))
vi.mock('@/sitemaps/service', () => ({ refreshSitemaps: scheduled.refresh }))

import { GET } from '@/app/api/sitemaps/route'
import { GET as getShard } from '@/app/api/sitemaps/[file]/route'
import { getSitemapCacheDirectory } from '@/sitemaps/utils'
import { SITEMAP_TTL_MS } from '@/sitemaps/constants'

describe('request-driven sitemap HTTP endpoints', () => {
  const directories: string[] = []
  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nswap-sitemap-http-'))
    directories.push(root)
    vi.stubEnv('SITEMAP_CACHE_DIR', root)
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://market.example')
    await mkdir(getSitemapCacheDirectory(), { recursive: true })
    scheduled.callbacks.splice(0)
    scheduled.refresh.mockClear()
  })
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    )
    vi.unstubAllEnvs()
  })
  const writeManifest = async (age = 0) => {
    const manifest = {
      version: 1,
      serverUrl: 'https://backend.example',
      frontendUrl: 'https://market.example',
      generatedAt: new Date(Date.now() - age).toISOString(),
      shards: [],
      syndicatedServers: [],
    }
    await writeFile(
      path.join(getSitemapCacheDirectory(), 'manifest.json'),
      JSON.stringify(manifest),
    )
    return manifest
  }
  it('serves a fresh file without scheduling any refresh', async () => {
    const manifest = await writeManifest()
    const response = await GET(new Request('https://backend.example/api/sitemaps'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(manifest)
    expect(scheduled.callbacks).toHaveLength(0)
  })
  it('serves stale data immediately and schedules a post-response refresh', async () => {
    const manifest = await writeManifest(SITEMAP_TTL_MS + 1)
    const response = await GET(new Request('https://backend.example/api/sitemaps'))
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Sitemap-Cache')).toBe('stale')
    expect(await response.json()).toEqual(manifest)
    expect(scheduled.callbacks).toHaveLength(1)
    await scheduled.callbacks[0]()
    expect(scheduled.refresh).toHaveBeenCalledTimes(1)
  })
  it('returns retryable 503 while the first snapshot is warming, never a fake empty sitemap', async () => {
    const response = await GET(new Request('https://backend.example/api/sitemaps'))
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(scheduled.callbacks).toHaveLength(1)
  })
  it('rejects path traversal without scheduling expensive work', async () => {
    const response = await getShard(
      new Request('https://backend.example/api/sitemaps/manifest.json'),
      { params: Promise.resolve({ file: '../manifest.json' }) },
    )
    expect(response.status).toBe(404)
    expect(scheduled.callbacks).toHaveLength(0)
  })
})
