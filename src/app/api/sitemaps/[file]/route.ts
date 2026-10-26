import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SITEMAP_FILE_PATTERN } from '@/sitemaps/constants'
import { getSitemapCacheDirectory, isMissingFile } from '@/sitemaps/utils'
import { readRequestedSitemapManifest } from '@/sitemaps/http'
import { limitBackendRequest } from '@/security/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export const GET = async (
  request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<Response> => {
  const limited = await limitBackendRequest(request)
  if (limited) {
    return limited
  }
  const { file } = await context.params
  if (!SITEMAP_FILE_PATTERN.test(file)) {
    return new Response('Invalid sitemap file.', { status: 404 })
  }
  try {
    await readRequestedSitemapManifest()
    const xml = await readFile(path.join(getSitemapCacheDirectory(), file), 'utf8')
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, stale-if-error=604800',
        'Content-Security-Policy': "default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (isMissingFile(error)) {
      return new Response('Sitemap file not found.', { status: 404 })
    }
    console.error('[sitemaps] Cannot read cached shard', error)
    return new Response('Sitemap cache unavailable.', {
      status: 503,
      headers: { 'Retry-After': '60' },
    })
  }
}
